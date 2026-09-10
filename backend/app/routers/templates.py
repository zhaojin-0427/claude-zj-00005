"""Training plan templates: 训练计划模板套用。"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, PlanTemplate
from ..deps import get_current_user
from ..schemas import TemplateIn
from ..serializers import template_dict
from .. import content

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_templates(goal: str | None = None, part: str | None = None,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(PlanTemplate)
    if goal:
        stmt = stmt.where(PlanTemplate.goal == goal)
    if part:
        stmt = stmt.where(PlanTemplate.primary_part == part)
    return [template_dict(t) for t in db.scalars(stmt.order_by(PlanTemplate.id)).all()]


@router.post("")
def create_template(body: TemplateIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if body.goal not in content.GOALS or body.primary_part not in content.PARTS:
        raise HTTPException(status_code=400, detail="训练目标或重点部位非法")
    t = PlanTemplate(
        name=body.name, goal=body.goal, primary_part=body.primary_part,
        level=body.level, description=body.description,
        exercises_json=json.dumps([e.model_dump() for e in body.exercises], ensure_ascii=False),
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    return template_dict(t)


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    t = db.get(PlanTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template_dict(t)
