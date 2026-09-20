sap.ui.define([
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/viz/ui5/controls/VizFrame",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/controls/common/feeds/FeedItem",
    "report/model/RAGQuery",
    "sap/m/ObjectStatus",
], function (Log, MessageBox, MessageToast, VizFrame, FlattenedDataset, FeedItem, RAGQuery, ObjectStatus) {
    "use strict";

    return {

        createAIExtendedLayout: function (oList, sAnswer, sIcon, sAlignment, aExecutionData, mExecutionField) {
            var sFormattedHtml = this._sanitizeToStandardHtml(sAnswer);

            // 1. Text View (Default)
            var oFormattedText = new sap.m.FormattedText({
                htmlText: sFormattedHtml
            }).addStyleClass("sapUiTinyMarginTop");

            // 2. Avatar
            var oAvatar = new sap.m.Avatar({
                src: sIcon || "sap-icon://ai",
                displaySize: "S"
            }).addStyleClass("sapUiSmallMarginEnd");

            // Container for dynamic views
            var oContentVBox = new sap.m.VBox({
                width: "100%",
                items: [oFormattedText]
            });

            // CustomListItem Instance created upfront so it can be referenced in callbacks
            var oCustomListItem = new sap.m.CustomListItem({
                type: "Inactive"
            });

            // 3. Process dynamic options if mExecutionField is valid
            if (mExecutionField && Object.keys(mExecutionField).length > 0) {
                var aKeys = Object.keys(mExecutionField);

                // Build Table Control
                var oTable = this._createDynamicTable(aExecutionData, mExecutionField);
                oTable.setVisible(false);
                oContentVBox.addItem(oTable);

                // Create SegmentedButton for view switching
                var oSegmentedButton = new sap.m.SegmentedButton({
                    selectedKey: "text",
                    items: [
                        new sap.m.SegmentedButtonItem({ key: "text", icon: "sap-icon://document-text", tooltip: "Text View" }),
                        new sap.m.SegmentedButtonItem({ key: "table", icon: "sap-icon://table-view", tooltip: "Table View" })
                    ]
                });

                // Check 2-column numeric chart criteria
                var bIsNumericChartEligible = aKeys.length === 2 && aExecutionData && aExecutionData.length > 0 && typeof aExecutionData[0][aKeys[1]] === "number";

                var oChart = null;
                if (bIsNumericChartEligible) {
                    oChart = this._createDynamicChart(aExecutionData, mExecutionField, "column");
                    oChart.setVisible(false);
                    oContentVBox.addItem(oChart);

                    oSegmentedButton.addItem(new sap.m.SegmentedButtonItem({ key: "column", icon: "sap-icon://vertical-bar-chart", tooltip: "Bar Chart" }));
                    oSegmentedButton.addItem(new sap.m.SegmentedButtonItem({ key: "line", icon: "sap-icon://line-chart", tooltip: "Line Chart" }));
                    oSegmentedButton.addItem(new sap.m.SegmentedButtonItem({ key: "area", icon: "sap-icon://area-chart", tooltip: "Area Chart" }));
                    oSegmentedButton.addItem(new sap.m.SegmentedButtonItem({ key: "pie", icon: "sap-icon://pie-chart", tooltip: "Pie Chart" }));
                }

                // Selection change handler
                oSegmentedButton.attachSelect(function (oEvent) {
                    var sKey = oEvent.getParameter("key");

                    oFormattedText.setVisible(sKey === "text");
                    oTable.setVisible(sKey === "table");

                    if (oChart) {
                        var bIsChart = ["column", "line", "area", "pie"].indexOf(sKey) !== -1;
                        oChart.setVisible(bIsChart);
                        if (bIsChart) {
                            this._updateChartFeeds(oChart, sKey, mExecutionField[aKeys[0]], mExecutionField[aKeys[1]]);
                            oChart.setVizType(sKey);
                        }
                    }
                }.bind(this));

                var aToolbarContent = [new sap.m.ToolbarSpacer(), oSegmentedButton];

                // Check Date + Numeric criteria for Forecast feature
                var bIsDateNumeric = aKeys.length === 2 && aExecutionData && aExecutionData.length > 0 &&
                    !isNaN(Date.parse(aExecutionData[0][aKeys[0]])) &&
                    typeof aExecutionData[0][aKeys[1]] === "number";

                if (bIsDateNumeric) {
                    var oForecastButton = new sap.m.Button({
                        icon: "sap-icon://future",
                        tooltip: "Forecast",
                        press: function () {
                            this._openForecastDialog(oList, oCustomListItem, aExecutionData, aKeys[0], aKeys[1]);
                        }.bind(this)
                    });
                    aToolbarContent.push(oForecastButton);
                }

                var oToolbar = new sap.m.OverflowToolbar({
                    design: "Transparent",
                    content: aToolbarContent
                }).addStyleClass("sapUiNoMargin");

                oContentVBox.insertItem(oToolbar, 0);
            }

            // 4. Wrap elements in primary HBox
            var oHBox = new sap.m.HBox({
                alignItems: "Start",
                justifyContent: sAlignment === "End" ? "End" : "Start",
                renderType: "Bare",
                items: [
                    oAvatar,
                    oContentVBox
                ]
            }).addStyleClass("sapUiTinyMarginTopBottom sapUiSmallMarginBeginEnd customAvatarTextRow");

            oCustomListItem.addContent(oHBox);
            return oCustomListItem;
        },
        _formatDateOnly: function (vDate) {
            if (!vDate) {
                return "";
            }
            var sDate = String(vDate).trim();

            // If string contains time part ('T' or space), extract date portion
            if (sDate.indexOf("T") !== -1) {
                sDate = sDate.split("T")[0];
            } else if (sDate.indexOf(" ") !== -1) {
                sDate = sDate.split(" ")[0];
            }

            return sDate;
        },
        _openForecastDialog: function (oList, oSourceListItem, aExecutionData, sDateFieldKey, sValueFieldKey) {
            var oStepInput = new sap.m.StepInput({
                value: 1,
                min: 1,
                max: 10,
                step: 1,
                width: "100%"
            });

            var oDialog = new sap.m.Dialog({
                title: "Forecast Settings",
                contentWidth: "320px",
                content: [
                    new sap.m.VBox({
                        items: [
                            new sap.m.Label({ text: "Enter forecast periods (1 to 10):" }),
                            oStepInput
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new sap.m.Button({
                    text: "Forecast",
                    type: "Emphasized",
                    press: function () {
                        var iHorizon = oStepInput.getValue();
                        oDialog.close();

                        // Format Payload using simple YYYY-MM-DD for 'ds'
                        var aFormattedData = aExecutionData.map(function (oRow) {
                            return {
                                ds: this._formatDateOnly(oRow[sDateFieldKey]),
                                y: Number(oRow[sValueFieldKey] || 0)
                            };
                        }.bind(this));

                        var oPayload = {
                            data: aFormattedData,
                            forecast_horizon: iHorizon
                        };

                        this._fetchForecastData(oList, oSourceListItem, oPayload);
                    }.bind(this)
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        /**
         * Calls forecast endpoint and inserts new response directly below the source item.
         * @private
         */
        _fetchForecastData: async function (oList, oSourceListItem, oPayload) {
            sap.ui.core.BusyIndicator.show(0);

            let aForecastResponse = await RAGQuery.getForcasrt(JSON.stringify(oPayload));
            if (!aForecastResponse.forecasts || !Array.isArray(aForecastResponse.forecasts)) {
                sap.m.MessageToast.show("Invalid forecast response received.");
                return;
            }
            // Filter and sanitize response data (ds converted to YYYY-MM-DD)
            var aFilteredForecast = aForecastResponse.forecasts.map(function (oItem) {
                return {
                    ds: this._formatDateOnly(oItem.ds),
                    final_forecast: oItem.final_forecast
                };
            }.bind(this));

            // Generate Forecast Result Layout
            var oForecastLayout = this.createAIForecastResultLayout("sap-icon://ai", "Start", aFilteredForecast, aForecastResponse.justification);

            if (oList && oForecastLayout) {
                var iIndex = oList.indexOfItem(oSourceListItem);

                // Insert directly below the source CustomListItem
                if (iIndex !== -1) {
                    oList.insertItem(oForecastLayout, iIndex + 1);
                } else {
                    oList.addItem(oForecastLayout);
                }

                // Scroll to newly inserted item
                setTimeout(function () {
                    var oDomRef = oForecastLayout.getDomRef();
                    if (oDomRef) {
                        oDomRef.scrollIntoView({ behavior: "smooth", block: "end" });
                    }
                }, 50);
            }
            sap.ui.core.BusyIndicator.hide();
        },
        createAIForecastResultLayout: function (sIcon, sAlignment, aForecastData, sjustification) {
            if (!aForecastData || aForecastData.length === 0) {
                return null;
            }

            var mForecastFields = {
                "ds": "Date",
                "final_forecast": "Final Forecast"
            };

            var oAvatar = new sap.m.Avatar({
                src: sIcon || "sap-icon://ai",
                displaySize: "S"
            }).addStyleClass("sapUiSmallMarginEnd");

            var oContentVBox = new sap.m.VBox({ width: "100%" });

            // 1. Build Table View (Default)
            var oTable = this._createDynamicTable(aForecastData, mForecastFields);
            oContentVBox.addItem(oTable);

            // 2. Build Chart View (Column Chart default)
            var oChart = this._createDynamicChart(aForecastData, mForecastFields, "column");
            oChart.setVisible(false);
            oContentVBox.addItem(oChart);

            // 3. View Switcher Toolbar (Table + 4 Charts)
            var oSegmentedButton = new sap.m.SegmentedButton({
                selectedKey: "table",
                items: [
                    new sap.m.SegmentedButtonItem({ key: "table", icon: "sap-icon://table-view", tooltip: "Table View" }),
                    new sap.m.SegmentedButtonItem({ key: "column", icon: "sap-icon://vertical-bar-chart", tooltip: "Bar Chart" }),
                    new sap.m.SegmentedButtonItem({ key: "line", icon: "sap-icon://line-chart", tooltip: "Line Chart" }),
                    new sap.m.SegmentedButtonItem({ key: "area", icon: "sap-icon://area-chart", tooltip: "Area Chart" }),
                    new sap.m.SegmentedButtonItem({ key: "pie", icon: "sap-icon://pie-chart", tooltip: "Pie Chart" })
                ]
            });

            oSegmentedButton.attachSelect(function (oEvent) {
                var sKey = oEvent.getParameter("key");

                oTable.setVisible(sKey === "table");

                var bIsChart = ["column", "line", "area", "pie"].indexOf(sKey) !== -1;
                oChart.setVisible(bIsChart);

                if (bIsChart) {
                    this._updateChartFeeds(oChart, sKey, mForecastFields["ds"], mForecastFields["final_forecast"]);
                    oChart.setVizType(sKey);
                }
            }.bind(this));

            var oToolbar = new sap.m.OverflowToolbar({
                design: "Transparent",
                content: [new sap.m.ToolbarSpacer(), oSegmentedButton]
            }).addStyleClass("sapUiNoMargin");

            oContentVBox.insertItem(oToolbar, 0);

            var oObjectStatus = new ObjectStatus({
                text: sjustification,
                icon: "sap-icon://information",
                state: "Information"
            });

            var oHBox = new sap.m.HBox({
                alignItems: "Start",
                justifyContent: sAlignment === "End" ? "End" : "Start",
                renderType: "Bare",
                items: [oAvatar, oContentVBox]
            }).addStyleClass("sapUiTinyMarginTopBottom sapUiSmallMarginBeginEnd customAvatarTextRow");

            return new sap.m.CustomListItem({
                type: "Inactive",
                content: [oHBox, oObjectStatus]
            });
        },

        _createDynamicTable: function (aExecutionData, mExecutionField) {
            var aColumns = [];
            var aCells = [];

            Object.keys(mExecutionField).forEach(function (sKey) {
                aColumns.push(new sap.m.Column({
                    header: new sap.m.Text({ text: mExecutionField[sKey] })
                }));
                aCells.push(new sap.m.Text({ text: "{localModel>" + sKey + "}" }));
            });

            var oTable = new sap.m.Table({
                columns: aColumns,
                items: {
                    path: "localModel>/",
                    template: new sap.m.ColumnListItem({ cells: aCells }),
                    templateShareable: false
                }
            });

            var oModel = new sap.ui.model.json.JSONModel(aExecutionData || []);
            oTable.setModel(oModel, "localModel");

            return oTable;
        },

        /**
         * Creates dynamic sap.viz.ui5.controls.VizFrame control instance.
         * @private
         */
        _createDynamicChart: function (aExecutionData, mExecutionField, sVizType) {
            var oVizFrame = new sap.viz.ui5.controls.VizFrame({
                vizType: sVizType || "column",
                width: "100%",
                height: "350px",
                uiConfig: { applicationSet: "fiori" }
            });

            var aKeys = Object.keys(mExecutionField);
            var sDimensionKey = aKeys[0];
            var sMeasureKey = aKeys[1];

            var oDataset = new sap.viz.ui5.data.FlattenedDataset({
                dimensions: [{ name: mExecutionField[sDimensionKey], value: "{localModel>" + sDimensionKey + "}" }],
                measures: [{ name: mExecutionField[sMeasureKey], value: "{localModel>" + sMeasureKey + "}" }],
                data: { path: "localModel>/" }
            });

            oVizFrame.setDataset(oDataset);

            var oModel = new sap.ui.model.json.JSONModel(aExecutionData || []);
            oVizFrame.setModel(oModel, "localModel");

            // Apply feeds dynamically based on chart type
            this._updateChartFeeds(oVizFrame, sVizType, mExecutionField[sDimensionKey], mExecutionField[sMeasureKey]);

            // Apply properties to display all entries
            oVizFrame.setVizProperties({
                plotArea: {
                    dataLabel: { visible: true },
                    dataLimitation: false,
                    maxCategoryCount: 100
                },
                title: { visible: false }
            });

            return oVizFrame;
        },

        /**
         * Updates FeedItems dynamically depending on whether the chart is a Pie chart or Axis chart.
         * @private
         */
        _updateChartFeeds: function (oVizFrame, sVizType, sDimLabel, sMeasLabel) {
            // 1. Destroy existing feeds to prevent Feed ID mismatch errors
            oVizFrame.destroyFeeds();

            var oMeasureFeed, oDimensionFeed;

            if (sVizType === "pie") {
                // Pie charts require 'size' and 'color'
                oMeasureFeed = new sap.viz.ui5.controls.common.feeds.FeedItem({
                    uid: "size",
                    type: "Measure",
                    values: [sMeasLabel]
                });
                oDimensionFeed = new sap.viz.ui5.controls.common.feeds.FeedItem({
                    uid: "color",
                    type: "Dimension",
                    values: [sDimLabel]
                });
            } else {
                // Column, Line, Area charts require 'valueAxis' and 'categoryAxis'
                oMeasureFeed = new sap.viz.ui5.controls.common.feeds.FeedItem({
                    uid: "valueAxis",
                    type: "Measure",
                    values: [sMeasLabel]
                });
                oDimensionFeed = new sap.viz.ui5.controls.common.feeds.FeedItem({
                    uid: "categoryAxis",
                    type: "Dimension",
                    values: [sDimLabel]
                });
            }

            oVizFrame.addFeed(oMeasureFeed);
            oVizFrame.addFeed(oDimensionFeed);
        },

        createAIFormattedTextLayout: function (sAnswer, sIcon, sAlignment) {
            var sFormattedHtml = this._sanitizeToStandardHtml(sAnswer);

            // Instantiate FormattedText control
            var oFormattedText = new sap.m.FormattedText({
                htmlText: sFormattedHtml
            }).addStyleClass("sapUiTinyMarginTop");

            // Instantiate Avatar
            var oAvatar = new sap.m.Avatar({
                src: sIcon || "sap-icon://ai",
                displaySize: "S"
            }).addStyleClass("sapUiSmallMarginEnd");

            // Wrap inside HBox with flex alignments
            var oHBox = new sap.m.HBox({
                alignItems: "Start", // Use "Start" so avatar stays at the top of long text blocks
                justifyContent: sAlignment === "End" ? "End" : "Start", // Flex justify content horizontally
                renderType: "Bare",
                items: [
                    oAvatar,
                    oFormattedText
                ]
            }).addStyleClass("sapUiTinyMarginTopBottom sapUiSmallMarginBeginEnd customAvatarTextRow");

            return new sap.m.CustomListItem({
                type: "Inactive",
                content: [oHBox]
            });
        },

        _sanitizeToStandardHtml: function (vAnswer) {
            // Ensure input is converted to a string safely
            var sText = "";
            if (typeof vAnswer === "string") {
                sText = vAnswer;
            } else if (vAnswer && typeof vAnswer === "object") {
                sText = vAnswer.text || vAnswer.message || JSON.stringify(vAnswer);
            }

            if (!sText) {
                return "";
            }

            // Standard SAP FormattedText handles basic tags like <strong>, <ul>, <li>, <br/>
            // Convert markdown syntax using standard String.prototype methods safely
            return String(sText)
                .split("**").join("<strong>") // Replaces alternating ** with <strong>/</strong>
                .replace(/<strong>(.*?)<strong>/g, "<strong>$1</strong>") // Fixes closing tags
                .split("\n").join("<br/>");
        },

        createAITextLayout: function (sAnswer, sIcon, sAlignment) {
            // 1. Instantiate Avatar with end margin
            var oAvatar = new sap.m.Avatar({
                src: sIcon || "sap-icon://ai",
                displaySize: "S"
            }).addStyleClass("sapUiSmallMarginEnd");

            // 2. Instantiate Text
            var oText = new sap.m.Text({
                text: sAnswer || ""
            });

            // 3. Enable flex cross-axis centering directly on HBox
            var oHBox = new sap.m.HBox({
                alignItems: "Center", // Flex align items vertically
                justifyContent: sAlignment === "End" ? "End" : "Start", // Flex justify content horizontally
                renderType: "Bare",
                items: [
                    oAvatar,
                    oText
                ]
            }).addStyleClass("sapUiTinyMarginTopBottom sapUiSmallMarginBeginEnd customAvatarTextRow");

            // 4. Return inside CustomListItem
            return new sap.m.CustomListItem({
                type: "Inactive",
                content: [oHBox]
            });
        },

        createAIExecutionLayout: function (aExecutionData, mExecutionField) {
            if (!mExecutionField || Object.keys(mExecutionField).length === 0) {
                return null;
            }

            // Pass data under a generic local key 'rows'
            var oModel = new sap.ui.model.json.JSONModel({
                rows: aExecutionData || []
            });

            var aColumns = [];
            var aCells = [];

            Object.keys(mExecutionField).forEach(function (sKey) {
                aColumns.push(new sap.m.Column({
                    header: new sap.m.Text({ text: mExecutionField[sKey] })
                }));

                aCells.push(new sap.m.Text({
                    text: "{" + sKey + "}"
                }));
            });

            var oTable = new sap.m.Table({
                columns: aColumns,
                items: {
                    path: "/rows", // Binds to the local model's 'rows' array safely
                    template: new sap.m.ColumnListItem({
                        cells: aCells
                    }),
                    templateShareable: false
                }
            });

            // Set model isolated strictly to this table instance
            oTable.setModel(oModel);

            var oAvatar = new sap.m.Avatar({
                src: "sap-icon://ai",
                displaySize: "S"
            }).addStyleClass("sapUiSmallMarginEnd");

            var oHBox = new sap.m.HBox({
                alignItems: "Center",
                justifyContent: "Start",
                renderType: "Bare",
                items: [oAvatar, oTable]
            }).addStyleClass("sapUiTinyMarginTopBottom sapUiSmallMarginBeginEnd customAvatarTextRow");

            return new sap.m.CustomListItem({
                type: "Inactive",
                content: [oHBox]
            });
        },
        getUserFeed: function (sQuery) {
            return {
                "senderIcon": "sap-icon://customer",
                "contentType": "text",
                "content": {
                    "text": sQuery
                }
            }
        },

        insertAnswerResponse: function (sResponse) {
            return {
                "senderIcon": "sap-icon://ai",
                "contentType": "text",
                "content": {
                    "text": sResponse.answer
                },
            }
        },

        insertAiResponse: function (sMode, sResponse) {
            switch (sMode) {
                case "context":
                    return this._insertAIContextFeed(sResponse);
                case "array":
                    return this._insertTableFeed(sResponse);
            }

        },

        _insertAIContextFeed: function (sResponse) {
            return {
                "senderIcon": "sap-icon://ai",
                "contentType": "text",
                "content": {
                    "text": sResponse.data.summary
                },
                // "content": sResponse.data.summary,
            }
        },

        _insertTableFeed: function (sResponse) {
            return {
                "senderIcon": "sap-icon://ai",
                "contentType": "table",
                "content": {
                    "text": sResponse.data.summary,
                    "tableData": this._getTableData(sResponse.data.items)
                }
            }
        },

        _getTableData: function (items) {
            return items.map(item => {
                const values = Object.values(item);
                const rawValue = values[1];
                return {
                    metric: "API Gateway Latency",
                    value: typeof rawValue === 'number' ? `${rawValue}ms` : String(rawValue)
                };
            });
        }
    };
});