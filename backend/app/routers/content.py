"""Static domain content for frontend selects."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..deps import get_current_user
from .. import content

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("")
def all_content(user: User = Depends(get_current_user)):
    return {
        "goals": [{"key": k, "label": v} for k, v in content.GOALS.items()],
        "parts": [{"key": k, "label": v} for k, v in content.PARTS.items()],
        "venue_kinds": [{"key": k, "label": v} for k, v in content.VENUE_KINDS.items()],
        "metrics": [{"key": k, **v} for k, v in content.METRICS.items()],
        "rpe_labels": [{"value": k, "label": v} for k, v in content.RPE_LABELS.items()],
        "exercise_library": content.EXERCISE_LIBRARY,
    }
