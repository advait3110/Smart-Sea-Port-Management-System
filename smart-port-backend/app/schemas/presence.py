from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PresenceResponse(BaseModel):
    user_id: int
    is_online: bool
    last_seen: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class PresenceUserResponse(BaseModel):
    user_id: int
    is_online: bool
    last_seen: datetime