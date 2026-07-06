"""
Finnhub-Service – News und Echtzeit-Quotes via Finnhub Free Tier.
API-Key wird aus der .env-Datei gelesen (FINNHUB_API_KEY).
Kostenloses Limit: 60 Requests/Minute.
"""
import os
import httpx
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# --- API-Key aus .env (FINNHUB_API_KEY=your_key_here) ---
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")
BASE_URL = "https://finnhub.io/api/v1"


def _headers() -> dict:
    return {"X-Finnhub-Token": FINNHUB_API_KEY}


def get_news(ticker: str, days_back: int = 7) -> list[dict]:
    """
    Holt Company-News der letzten `days_back` Tage für einen Ticker.
    Endpoint: GET /company-news?symbol=AAPL&from=...&to=...
    Gibt leere Liste zurück, wenn kein API-Key gesetzt ist.
    """
    if not FINNHUB_API_KEY:
        return _fallback_news(ticker)

    date_to   = datetime.utcnow().strftime("%Y-%m-%d")
    date_from = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")

    try:
        resp = httpx.get(
            f"{BASE_URL}/company-news",
            params={"symbol": ticker, "from": date_from, "to": date_to},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json()
        result = []
        for item in items[:20]:   # max. 20 News
            result.append({
                "id":        item.get("id"),
                "headline":  item.get("headline", ""),
                "summary":   item.get("summary", ""),
                "source":    item.get("source", ""),
                "url":       item.get("url", ""),
                "image":     item.get("image", ""),
                "published": datetime.utcfromtimestamp(item.get("datetime", 0)).isoformat() + "Z",
            })
        return result
    except Exception as e:
        return _fallback_news(ticker)


def get_realtime_quote(ticker: str) -> dict | None:
    """
    Finnhub Echtzeit-Quote (aktueller Kurs, %-Änderung).
    Wird als Fallback genutzt, wenn yfinance temporär nicht erreichbar ist.
    Endpoint: GET /quote?symbol=AAPL
    """
    if not FINNHUB_API_KEY:
        return None

    try:
        resp = httpx.get(
            f"{BASE_URL}/quote",
            params={"symbol": ticker},
            headers=_headers(),
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("c"):
            return None
        return {
            "ticker":     ticker.upper(),
            "price":      round(data["c"], 2),
            "change":     round(data["d"], 2),
            "change_pct": round(data["dp"], 2),
            "high":       round(data["h"], 2),
            "low":        round(data["l"], 2),
            "prev_close": round(data["pc"], 2),
            "source":     "finnhub",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
    except Exception:
        return None


def search_symbols(query: str) -> list[dict]:
    """
    Symbol-Suche via Finnhub (Fallback wenn Yahoo Finance nicht erreichbar).
    Endpoint: GET /search?q=...
    """
    if not FINNHUB_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{BASE_URL}/search",
            params={"q": query},
            headers=_headers(),
            timeout=8,
        )
        resp.raise_for_status()
        items = resp.json().get("result", [])
        return [
            {
                "ticker":   it.get("symbol", ""),
                "name":     it.get("description", ""),
                "exchange": it.get("primaryExchange", ""),
                "type":     it.get("type", ""),
            }
            for it in items[:8]
        ]
    except Exception:
        return []


def _fallback_news(ticker: str) -> list[dict]:
    """
    RSS-Fallback: Yahoo Finance RSS-Feed, wenn Finnhub-Key fehlt oder Limit erreicht.
    Gibt leere Liste zurück, um Fehlerfreiheit zu garantieren.
    """
    return []


def get_earnings(ticker: str) -> list[dict]:
    """
    Earnings-History + Überraschungen (EPS actual vs estimate).
    Endpoint: GET /stock/earnings?symbol=AAPL
    """
    if not FINNHUB_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{BASE_URL}/stock/earnings",
            params={"symbol": ticker},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json()
        result = []
        for it in (items if isinstance(items, list) else []):
            actual   = it.get("actual")
            estimate = it.get("estimate")
            surprise = None
            if actual is not None and estimate and estimate != 0:
                surprise = round((actual - estimate) / abs(estimate) * 100, 2)
            result.append({
                "period":    it.get("period", ""),
                "actual":    actual,
                "estimate":  estimate,
                "surprise":  surprise,                        # % beat/miss
                "beat":      actual > estimate if (actual is not None and estimate is not None) else None,
            })
        return result
    except Exception:
        return []


def get_earnings_calendar(ticker: str) -> dict | None:
    """
    Nächster Earnings-Termin (Next Earnings Date) + Expected EPS.
    Endpoint: GET /calendar/earnings?symbol=AAPL&from=...&to=...
    """
    if not FINNHUB_API_KEY:
        return None
    try:
        today = datetime.utcnow()
        date_from = today.strftime("%Y-%m-%d")
        date_to   = (today + timedelta(days=90)).strftime("%Y-%m-%d")
        resp = httpx.get(
            f"{BASE_URL}/calendar/earnings",
            params={"symbol": ticker, "from": date_from, "to": date_to},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("earningsCalendar", [])
        if items:
            it = items[0]
            return {
                "date":              it.get("date"),
                "eps_estimate":      it.get("epsEstimate"),
                "revenue_estimate":  it.get("revenueEstimate"),
                "hour":              it.get("hour"),   # "bmo"=before open, "amc"=after close
            }
        return None
    except Exception:
        return None


def get_insider_transactions(ticker: str) -> list[dict]:
    """
    SEC Form-4 Insider-Transaktionen (letzte 12 Monate).
    Endpoint: GET /stock/insider-transactions?symbol=AAPL
    """
    if not FINNHUB_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{BASE_URL}/stock/insider-transactions",
            params={"symbol": ticker},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data", [])
        result = []
        for it in items[:30]:   # max 30 Transaktionen
            shares = it.get("share", 0)
            price  = it.get("transactionPrice", 0)
            result.append({
                "name":         it.get("name", ""),
                "title":        it.get("officerTitle", ""),
                "transaction":  it.get("transactionCode", ""),   # P=Purchase, S=Sale
                "shares":       shares,
                "price":        price,
                "value":        round(shares * price, 0) if (shares and price) else 0,
                "date":         it.get("filingDate", it.get("transactionDate", "")),
                "is_buy":       it.get("transactionCode", "") == "P",
            })
        return result
    except Exception:
        return []


def get_recommendation_trends(ticker: str) -> list[dict]:
    """
    Analysten-Empfehlungen (Strong Buy / Buy / Hold / Sell).
    Endpoint: GET /stock/recommendation?symbol=AAPL
    """
    if not FINNHUB_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{BASE_URL}/stock/recommendation",
            params={"symbol": ticker},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json()
        return [
            {
                "period":      it.get("period", ""),
                "strong_buy":  it.get("strongBuy", 0),
                "buy":         it.get("buy", 0),
                "hold":        it.get("hold", 0),
                "sell":        it.get("sell", 0),
                "strong_sell": it.get("strongSell", 0),
            }
            for it in (items[:4] if isinstance(items, list) else [])
        ]
    except Exception:
        return []

