"""FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine, SessionLocal
from .routers import auth, members, resources, bookings, templates, measurements, stats, content as content_router, plans

Base.metadata.create_all(bind=engine)

app = FastAPI(title="健身房私教课程预约与训练档案追踪系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(members.router)
app.include_router(resources.router)
app.include_router(bookings.router)
app.include_router(templates.router)
app.include_router(measurements.router)
app.include_router(stats.router)
app.include_router(plans.router)
app.include_router(content_router.router)


@app.on_event("startup")
def ensure_seed():
    from .seed import seed_if_empty
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}
