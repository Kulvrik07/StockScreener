"""
Screener-Endpoint – filtert eine vorgegebene Ticker-Menge nach Kennzahlen.
POST /screener
Body: { "tickers": ["AAPL","MSFT",...], "filters": { "pe_max": 30, "rsi_max": 30, "mcap_min": 1e9 } }
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from backend.services import yfinance_service
from backend.services.cache_service import screener_cache, cache_lock
import json

router = APIRouter(prefix="/screener", tags=["Screener"])

# Standard-Universum für den Screener (S&P 100 Auswahl)
DEFAULT_UNIVERSE = [
    "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","BRK-B","JPM","JNJ",
    "V","PG","UNH","HD","MA","DIS","PYPL","BAC","ADBE","NFLX",
    "CMCSA","PFE","XOM","KO","PEP","INTC","CSCO","ABT","TMO","NKE",
    "AVGO","QCOM","TXN","COST","ORCL","WMT","CVX","ACN","HON","MRK",
    "LLY","BMY","ABBV","AMGN","GILD","MDT","ISRG","SYK","BDX","VRTX",
    "CRM","NOW","WDAY","SNOW","ZM","DOCU","OKTA","MDB","DDOG","NET",
]


class ScreenerFilter(BaseModel):
    tickers:      list[str] | None = None  # None → DEFAULT_UNIVERSE
    pe_max:       float | None = None
    pe_min:       float | None = None
    ps_max:       float | None = None
    mcap_min:     float | None = None
    mcap_max:     float | None = None
    div_yield_min: float | None = None
    eps_min:      float | None = None
    debt_eq_max:  float | None = None
    rev_growth_min: float | None = None
    # Neue Filter ──────────────────────────────────────────────
    near_52w_high:  float | None = None   # max % unter 52W-Hoch (z.B. -5 = max 5% unter Hoch)
    near_52w_low:   float | None = None   # min % über 52W-Tief  (z.B. 10 = min 10% über Tief)
    short_float_max: float | None = None  # Short Float % max (z.B. 5 = max 5%)
    beta_max:       float | None = None
    beta_min:       float | None = None
    change_pct_min: float | None = None   # Tagesperformance min %
    change_pct_max: float | None = None
    sort_by:      str = "market_cap"
    sort_desc:    bool = True


@router.post("")
def run_screener(body: ScreenerFilter):
    tickers = body.tickers or DEFAULT_UNIVERSE

    cache_key = json.dumps(body.model_dump(), sort_keys=True)
    with cache_lock:
        cached = screener_cache.get(cache_key)
    if cached:
        return {"results": cached, "from_cache": True}

    raw = yfinance_service.get_screener_data(tickers)

    # Filter anwenden
    filtered = []
    for row in raw:
        if body.pe_max  is not None and (row["pe_ratio"]  is None or row["pe_ratio"]  > body.pe_max):  continue
        if body.pe_min  is not None and (row["pe_ratio"]  is None or row["pe_ratio"]  < body.pe_min):  continue
        if body.ps_max  is not None and (row["ps_ratio"]  is None or row["ps_ratio"]  > body.ps_max):  continue
        if body.mcap_min is not None and (row["market_cap"] is None or row["market_cap"] < body.mcap_min): continue
        if body.mcap_max is not None and (row["market_cap"] is None or row["market_cap"] > body.mcap_max): continue
        if body.div_yield_min is not None and (row["dividend_yield"] is None or row["dividend_yield"] < body.div_yield_min): continue
        if body.eps_min is not None and (row["eps"] is None or row["eps"] < body.eps_min): continue
        if body.debt_eq_max is not None and (row["debt_to_equity"] is None or row["debt_to_equity"] > body.debt_eq_max): continue
        if body.rev_growth_min is not None and (row["revenue_growth"] is None or row["revenue_growth"] < body.rev_growth_min): continue
        # Neue Filter
        if body.near_52w_high is not None and (row.get("pct_from_high") is None or row["pct_from_high"] < body.near_52w_high): continue
        if body.near_52w_low  is not None and (row.get("pct_from_low")  is None or row["pct_from_low"]  < body.near_52w_low):  continue
        if body.short_float_max is not None:
            sf = row.get("short_pct_float")
            if sf is not None and sf * 100 > body.short_float_max: continue
        if body.beta_max is not None and (row.get("beta") is None or row["beta"] > body.beta_max): continue
        if body.beta_min is not None and (row.get("beta") is None or row["beta"] < body.beta_min): continue
        if body.change_pct_min is not None and (row["change_pct"] is None or row["change_pct"] < body.change_pct_min): continue
        if body.change_pct_max is not None and (row["change_pct"] is None or row["change_pct"] > body.change_pct_max): continue
        filtered.append(row)

    # Sortierung
    def sort_key(r):
        val = r.get(body.sort_by)
        return val if val is not None else (-float("inf") if body.sort_desc else float("inf"))

    filtered.sort(key=sort_key, reverse=body.sort_desc)

    with cache_lock:
        screener_cache[cache_key] = filtered

    return {"results": filtered, "count": len(filtered), "from_cache": False}


@router.get("/universe")
def get_default_universe():
    """Gibt das Standard-Ticker-Universum zurück."""
    return {"tickers": DEFAULT_UNIVERSE}
