import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from app.schemas.report_schema import ColumnMetaData, SessionInfo

class SessionData:
    def __init__(self, report_id: str, columns: List[ColumnMetaData], data: List[Dict[str, Any]]):
        self.report_id = report_id
        self.columns = columns
        self.data = data
        self.created_at = datetime.utcnow().isoformat() + "Z"

class DatasetCacheManager:
    """
    Pure manual session storage.
    Sessions stay permanently in memory until explicitly removed via delete_session().
    """
    def __init__(self):
        self._storage: Dict[str, SessionData] = {}

    def create_session(self, report_id: str, columns: List[ColumnMetaData], data: List[Dict[str, Any]]) -> str:
        session_id = str(uuid.uuid4())
        self._storage[session_id] = SessionData(report_id, columns, data)
        return session_id

    def get_session(self, session_id: str) -> Optional[SessionData]:
        clean_id = session_id.strip() if session_id else ""
        return self._storage.get(clean_id)

    def list_all_sessions(self) -> List[SessionInfo]:
        """Returns metadata for all currently active sessions."""
        return [
            SessionInfo(
                session_id=sid,
                report_id=session.report_id,
                row_count=len(session.data),
                column_count=len(session.columns),
                created_at=session.created_at
            )
            for sid, session in self._storage.items()
        ]

    def delete_session(self, session_id: str) -> bool:
        """Manual deletion triggered exclusively by client request."""
        clean_id = session_id.strip() if session_id else ""
        if clean_id in self._storage:
            del self._storage[clean_id]
            return True
        return False

    def update_session_data(self, session_id: str, updated_data: List[Dict[str, Any]]) -> bool:
        if session_id in self._sessions:
            self._sessions[session_id].data = updated_data
            return True
        return False

cache_manager = DatasetCacheManager()