"""
Watchlist-Endpoints – CRUD-Operationen auf der SQLite-Datenbank.
GET  /watchlist          → alle Einträge
POST /watchlist          → Ticker hinzufügen  { "ticker": "AAPL" }
DELETE /watchlist/{tick} → Ticker entfernen
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.database import get_connection

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])


class WatchlistItem(BaseModel):
    ticker: str
    name: str | None = None


@router.get("")
def get_watchlist():
    conn = get_connection()
    rows = conn.execute(
        "SELECT ticker, name, added_at FROM watchlist ORDER BY added_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
def add_to_watchlist(item: WatchlistItem):
    ticker = item.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker darf nicht leer sein")
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist (ticker, name) VALUES (?, ?)",
            (ticker, item.name),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ticker": ticker, "status": "added"}


@router.delete("/{ticker}")
def remove_from_watchlist(ticker: str):
    ticker = ticker.upper().strip()
    conn = get_connection()
    conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker,))
    conn.commit()
    conn.close()
    return {"ticker": ticker, "status": "removed"}
