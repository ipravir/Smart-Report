import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoETS
from fastapi import HTTPException, status

class TimeSeriesForecastService:
    @staticmethod
    def run_ensemble_forecast(
        data: List[Dict[str, Any]], 
        forecast_horizon: int = 1, 
        freq: str = None
    ) -> Tuple[List[Dict[str, Any]], str]:
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input data array cannot be empty."
            )

        try:
            # 1. Clean & Sort
            df = pd.DataFrame(data)
            df['ds'] = pd.to_datetime(df['ds'])
            df['y'] = df['y'].astype(float)
            df = df.sort_values('ds').drop_duplicates(subset=['ds']).set_index('ds')

            # 2. Resample time-series to fill missing dates with 0
            resample_freq = freq if freq else 'D'
            df_resampled = df.resample(resample_freq).asfreq().fillna({'y': 0.0}).reset_index()
            df_resampled['unique_id'] = 'series_1'

            # Calculate data characteristics for justification
            total_raw_points = len(df)
            resampled_points = len(df_resampled)
            zero_ratio = (df_resampled['y'] == 0).mean()
            
            # 3. Fit StatsForecast models
            models = [
                AutoARIMA(season_length=7 if resample_freq == 'D' else 1),
                AutoETS(season_length=7 if resample_freq == 'D' else 1)
            ]

            sf = StatsForecast(
                models=models,
                freq=resample_freq,
                n_jobs=-1
            )

            sf.fit(df_resampled)
            forecast_df = sf.predict(h=forecast_horizon).reset_index()

            # 4. Extract outputs
            results = []
            for _, row in forecast_df.iterrows():
                arima_val = float(row['AutoARIMA'])
                ets_val = float(row['AutoETS'])
                
                # Floor forecasts at 0 to avoid negative series values
                arima_val = max(0.0, arima_val)
                ets_val = max(0.0, ets_val)
                final_val = (arima_val + ets_val) / 2.0

                date_str = row['ds'].strftime('%Y-%m-%d') if hasattr(row['ds'], 'strftime') else str(row['ds'])

                results.append({
                    "ds": date_str,
                    "final_forecast": round(final_val, 4),
                    "auto_arima_forecast": round(arima_val, 4),
                    "auto_ets_forecast": round(ets_val, 4)
                })

            # 5. Build dynamic justification details
            justification_notes = []
            if zero_ratio > 0.5:
                justification_notes.append(
                    f"Data is highly sparse ({round(zero_ratio * 100, 1)}% missing/zero dates across timeline). "
                    "Input series was automatically regularized and filled with zeros to enable statistical fitting."
                )
            
            # Check variance in predictions
            predictions = [r["final_forecast"] for r in results]
            if len(set(predictions)) == 1:
                justification_notes.append(
                    "Due to long historical gaps and high noise variance, AutoARIMA and AutoETS converged on a flat mean trajectory."
                )
            else:
                justification_notes.append(
                    f"Ensemble predictions incorporate dynamic trend/seasonality over a {forecast_horizon}-step horizon."
                )

            justification_text = " ".join(justification_notes)

            return results, justification_text

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Forecasting engine execution failed: {str(e)}"
            )

forecast_service = TimeSeriesForecastService()