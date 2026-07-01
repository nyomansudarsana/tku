from pydantic import BaseModel
from typing import Dict


class PermissionCatalogItem(BaseModel):
    permission_key: str
    label: str
    group_label: str
    sort_order: int

    class Config:
        from_attributes = True


class UserPermissionsResponse(BaseModel):
    user_id: int
    role: str
    effective: Dict[str, bool]   # role defaults merged with this user's overrides
    overrides: Dict[str, bool]   # only the keys that deviate from the role default


class UserPermissionsUpdate(BaseModel):
    # Full desired state of every checkbox the Role Management screen renders —
    # the server diffs this against the role default and stores only the deltas.
    overrides: Dict[str, bool]
