"""Coach workbench and business analytics (统计页)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..deps import require_roles
from ..services import dashboard_stats, coach_workbench

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/coaches/{coach_id}/workbench")
def workbench(coach_id: int, db: Session = Depends(get_db),
              user: User = Depends(require_roles("admin", "coach"))):
    if user.role == "coach" and user.id != coach_id:
        raise HTTPException(status_code=403, detail="只能查看自己的工作台")
    return coach_workbench(coach_id, db)


@router.get("/stats/dashboard")
def stats_dashboard(days: int = Query(90), db: Session = Depends(get_db),
                    user: User = Depends(require_roles("admin", "coach"))):
    return dashboard_stats(db, days=days)
