"""
FastAPI-Hauptanwendung – Stockscreener Backend.
Startet mit: uvicorn backend.main:app --reload --port 8000
"""
import os
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

from backend.database import init_db
from backend.routes.watchlist    import router as watchlist_router
from backend.routes.quotes       import router as quote_router, search_router
from backend.routes.fundamentals import router as fundamentals_router
from backend.routes.chart        import router as chart_router
from backend.routes.news         import router as news_router
from backend.routes.screener     import router as screener_router
from backend.routes.browse       import router as browse_router
from backend.routes.earnings     import router as earnings_router
from backend.routes.insider      import router as insider_router
from backend.routes.options      import router as options_router
from backend.routes.heatmap      import router as heatmap_router
from backend.routes.cot          import router as cot_router

load_dotenv()

app = FastAPI(
    title="Stock Screener API",
    description="Kompakter TradingView-Ersatz – reine Analyse, kein Trading.",
    version="1.0.0",
)

# CORS – erlaubt Browser-Requests vom selben Host (localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # In Produktion auf eigene Domain einschränken
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kein Browser-Caching für API-Antworten
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response

app.add_middleware(NoCacheMiddleware)

# Datenbank initialisieren beim Start
@app.on_event("startup")
def startup_event():
    init_db()

# API-Routen registrieren
app.include_router(watchlist_router,    prefix="/api")
app.include_router(quote_router,        prefix="/api")
app.include_router(search_router,       prefix="/api")
app.include_router(fundamentals_router, prefix="/api")
app.include_router(chart_router,        prefix="/api")
app.include_router(news_router,         prefix="/api")
app.include_router(screener_router,     prefix="/api")
app.include_router(browse_router,       prefix="/api")
app.include_router(earnings_router,     prefix="/api")
app.include_router(insider_router,      prefix="/api")
app.include_router(options_router,      prefix="/api")
app.include_router(heatmap_router,      prefix="/api")
app.include_router(cot_router,          prefix="/api")

# Frontend als statische Dateien ausliefern
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
