from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import qa_router

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Production-grade API to execute NL-to-SQL report queries over active datasets."
)

# Configure CORS for Dashboard/Web Clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qa_router.router)

@app.get("/health", tags=["Health Check"])
async def health_check():
    return {"status": "online", "service": settings.APP_NAME}