from fastapi import FastAPI

app = FastAPI(
    title="Karwar Port Smart Sea Port Management System",
    description="Smart Sea Port Management and Monitoring System for Karwar Port",
    version="1.0.0",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Karwar Port Smart Sea Port Management System",
    }