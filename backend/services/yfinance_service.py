"""
Yahoo Finance Service – curl_cffi mit Chrome-TLS-Fingerprint + Session-Crumb.
Umgeht Cloudflare-Fingerprinting und löst Crumb-Authentifizierung automatisch.
"""
from curl_cffi import requests as cf
from datetime import datetime
import threading
import time

YF_BASE = "https://query2.finance.yahoo.com"

# Alle unterstützten Zeitrahmen.
# Yahoo Finance native Intervalle: 1m,2m,5m,15m,30m,60m,90m,1d,5d,1wk,1mo,3mo
# 2H/4H/6H/12H werden aus 60m-Daten aggregiert (server-seitig).
RANGE_MAP = {
    # ── Intraday ──────────────────────────────────────────────
    "1m":  {"period": "1d",   "interval": "1m",  "agg": 1},
    "2m":  {"period": "5d",   "interval": "2m",  "agg": 1},
    "5m":  {"period": "5d",   "interval": "5m",  "agg": 1},
    "15m": {"period": "60d",  "interval": "15m", "agg": 1},
    "30m": {"period": "60d",  "interval": "30m", "agg": 1},
    "1H":  {"period": "60d",  "interval": "60m", "agg": 1},
    "2H":  {"period": "60d",  "interval": "60m", "agg": 2},   # aggregiert
    "4H":  {"period": "730d", "interval": "60m", "agg": 4},   # aggregiert
    "6H":  {"period": "730d", "interval": "60m", "agg": 6},   # aggregiert
    "12H": {"period": "730d", "interval": "60m", "agg": 12},  # aggregiert
    # ── Daily / Weekly / Monthly ───────────────────────────────
    "1D":  {"period": "1mo",  "interval": "1d",  "agg": 1},
    "1W":  {"period": "1y",   "interval": "1wk", "agg": 1},
    "1M":  {"period": "5y",   "interval": "1mo", "agg": 1},
}

# Persistente Session für Cookie+Crumb (thread-safe)
_session     = None
_crumb       = None
_session_lock = threading.Lock()


def _ensure_session() -> tuple:
    """Gibt (session, crumb) zurück – erstellt/erneuert bei Bedarf."""
    global _session, _crumb
    with _session_lock:
        if _session and _crumb:
            return _session, _crumb
        s = cf.Session(impersonate="chrome")
        try:
            s.get("https://finance.yahoo.com/", timeout=10)
            r = s.get(f"{YF_BASE}/v1/test/getcrumb", timeout=8)
            crumb = r.text.strip() if r.status_code == 200 else ""
        except Exception:
            crumb = ""
        _session, _crumb = s, crumb
        return s, crumb


def _get(url: str, params: dict = None, need_crumb: bool = False, timeout: int = 15):
    """GET via persistente Chrome-Session. Bei 401/429 Session erneuern."""
    global _session, _crumb
    p = dict(params or {})
    s, crumb = _ensure_session()
    if need_crumb and crumb:
        p["crumb"] = crumb

    for attempt in range(3):
        r = s.get(url, params=p, timeout=timeout)
        if r.status_code == 200:
            return r
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        if r.status_code in (401, 403):
            # Session erneuern
            with _session_lock:
                _session, _crumb = None, None
            s, crumb = _ensure_session()
            if need_crumb and crumb:
                p["crumb"] = crumb
            continue
        r.raise_for_status()
    raise RuntimeError(f"Yahoo Finance nicht erreichbar ({url})")


# ── Öffentliche API ────────────────────────────────────────────────

def get_quote(ticker: str) -> dict:
    r = _get(f"{YF_BASE}/v8/finance/chart/{ticker}", {"interval": "1d", "range": "5d"})
    meta  = r.json()["chart"]["result"][0]["meta"]
    price = round(float(meta.get("regularMarketPrice", 0)), 2)
    prev  = round(float(meta.get("chartPreviousClose", meta.get("previousClose", price))), 2)
    chg   = round(((price - prev) / prev) * 100, 2) if prev else 0
    return {
        "ticker": ticker.upper(), "price": price, "prev_close": prev,
        "change_pct": chg, "volume": int(meta.get("regularMarketVolume", 0)),
        "market_cap": 0, "currency": meta.get("currency", "USD"),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


def get_fundamentals(ticker: str) -> dict:
    modules = "summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistory,incomeStatementHistoryQuarterly,assetProfile"
    r = _get(f"{YF_BASE}/v10/finance/quoteSummary/{ticker}",
             {"modules": modules}, need_crumb=True, timeout=20)
    r.raise_for_status()
    res = r.json().get("quoteSummary", {}).get("result", [{}])[0]
    sd  = res.get("summaryDetail", {})
    ks  = res.get("defaultKeyStatistics", {})
    fd  = res.get("financialData", {})
    ap  = res.get("assetProfile", {})

    def raw(d, key):
        v = d.get(key, {})
        return v.get("raw") if isinstance(v, dict) else v

    quarters = [
        {"period": s.get("endDate", {}).get("fmt", ""),
         "revenue": raw(s, "totalRevenue"), "net_income": raw(s, "netIncome")}
        for s in res.get("incomeStatementHistoryQuarterly", {}).get("incomeStatementHistory", [])[:4]
    ]
    annual = [
        {"period": s.get("endDate", {}).get("fmt", ""),
         "revenue": raw(s, "totalRevenue"), "net_income": raw(s, "netIncome")}
        for s in res.get("incomeStatementHistory", {}).get("incomeStatementHistory", [])[:4]
    ]

    return {
        "ticker": ticker.upper(), "name": ap.get("longName", ticker),
        "sector": ap.get("sector"), "industry": ap.get("industry"),
        "pe_ratio": raw(sd, "trailingPE"), "forward_pe": raw(sd, "forwardPE"),
        "ps_ratio": raw(ks, "priceToSalesTrailing12Months"), "pb_ratio": raw(ks, "priceToBook"),
        "eps": raw(ks, "trailingEps"), "eps_forward": raw(ks, "forwardEps"),
        "market_cap": raw(sd, "marketCap"), "dividend_yield": raw(sd, "dividendYield"),
        "payout_ratio": raw(sd, "payoutRatio"), "revenue_growth": raw(fd, "revenueGrowth"),
        "earnings_growth": raw(fd, "earningsGrowth"), "debt_to_equity": raw(fd, "debtToEquity"),
        "current_ratio": raw(fd, "currentRatio"), "return_on_equity": raw(fd, "returnOnEquity"),
        "profit_margins": raw(fd, "profitMargins"), "free_cashflow": raw(fd, "freeCashflow"),
        "quarterly_results": quarters, "annual_results": annual,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


def _aggregate_candles(raw_candles: list[dict], n: int) -> list[dict]:
    """Fasst je n aufeinanderfolgende 1H-Kerzen zu einer Kerze zusammen (für 2H/4H/6H/12H)."""
    if n <= 1:
        return raw_candles
    out = []
    for i in range(0, len(raw_candles), n):
        group = raw_candles[i:i + n]
        if not group:
            continue
        out.append({
            "time":   group[0]["time"],
            "open":   group[0]["open"],
            "high":   max(c["high"]  for c in group),
            "low":    min(c["low"]   for c in group),
            "close":  group[-1]["close"],
            "volume": sum(c["volume"] for c in group),
        })
    return out


def get_chart_data(ticker: str, time_range: str = "1D") -> dict:
    p   = RANGE_MAP.get(time_range, RANGE_MAP["1D"])
    agg = p.get("agg", 1)
    r   = _get(f"{YF_BASE}/v8/finance/chart/{ticker}", {"interval": p["interval"], "range": p["period"]})
    result = r.json().get("chart", {}).get("result", [])
    if not result:
        return {"ticker": ticker, "range": time_range, "candles": [], "error": "no data"}

    res    = result[0]
    times  = res.get("timestamp", [])
    ohlcv  = res.get("indicators", {}).get("quote", [{}])[0]
    opens  = ohlcv.get("open",   [])
    highs  = ohlcv.get("high",   [])
    lows   = ohlcv.get("low",    [])
    closes = ohlcv.get("close",  [])
    vols   = ohlcv.get("volume", [])

    raw_candles = []
    for i, ts in enumerate(times):
        if ts is None: continue
        o = opens[i]  if i < len(opens)  else None
        h = highs[i]  if i < len(highs)  else None
        l = lows[i]   if i < len(lows)   else None
        c = closes[i] if i < len(closes) else None
        v = vols[i]   if i < len(vols)   else 0
        if None in (o, h, l, c): continue
        raw_candles.append({"time": int(ts), "open": round(float(o), 4),
                            "high": round(float(h), 4), "low": round(float(l), 4),
                            "close": round(float(c), 4), "volume": int(v or 0)})

    candles = _aggregate_candles(raw_candles, agg)
    label   = f"{agg}h" if agg > 1 else p["interval"]
    return {"ticker": ticker.upper(), "range": time_range, "interval": label,
            "candles": candles, "updated_at": datetime.utcnow().isoformat() + "Z"}


def search_ticker(query: str) -> list[dict]:
    try:
        r = _get(f"{YF_BASE}/v1/finance/search", {"q": query, "quotesCount": 8, "newsCount": 0})
        r.raise_for_status()
        return [{"ticker": q.get("symbol", ""), "name": q.get("longname", q.get("shortname", "")),
                 "exchange": q.get("exchange", ""), "type": q.get("quoteType", "")}
                for q in r.json().get("quotes", []) if q.get("symbol")]
    except Exception:
        return []



def get_short_interest(ticker: str) -> dict:
    """Short Interest, Float, Days-to-Cover aus defaultKeyStatistics."""
    try:
        r = _get(f"{YF_BASE}/v10/finance/quoteSummary/{ticker}",
                 {"modules": "defaultKeyStatistics,summaryDetail"}, need_crumb=True, timeout=12)
        r.raise_for_status()
        res = r.json().get("quoteSummary", {}).get("result", [{}])[0]
        ks  = res.get("defaultKeyStatistics", {})
        sd  = res.get("summaryDetail", {})

        def raw(d, k):
            v = d.get(k, {})
            return v.get("raw") if isinstance(v, dict) else v

        shares_short     = raw(ks, "sharesShort")
        float_shares     = raw(ks, "floatShares")
        shares_out       = raw(ks, "sharesOutstanding")
        short_ratio      = raw(ks, "shortRatio")       # Days-to-Cover
        short_pct_float  = raw(ks, "shortPercentOfFloat")
        avg_vol          = raw(sd, "averageVolume")

        return {
            "ticker":             ticker.upper(),
            "shares_short":       shares_short,
            "float_shares":       float_shares,
            "shares_outstanding": shares_out,
            "short_pct_float":    round(short_pct_float * 100, 2) if short_pct_float else None,
            "days_to_cover":      round(short_ratio, 2) if short_ratio else None,
            "avg_volume":         avg_vol,
        }
    except Exception as e:
        return {"ticker": ticker.upper(), "error": str(e)}


def get_options_summary(ticker: str) -> dict:
    """
    Put/Call-Ratio + verfügbare Ablaufdaten aus Yahoo Finance Options API.
    Endpoint: v7/finance/options/{ticker}
    """
    try:
        r = _get(f"{YF_BASE}/v7/finance/options/{ticker}", timeout=15)
        r.raise_for_status()
        data    = r.json().get("optionChain", {}).get("result", [{}])[0]
        options = data.get("options", [{}])[0]
        calls   = options.get("calls", [])
        puts    = options.get("puts",  [])

        # Put/Call-Ratio nach OI
        call_oi = sum(c.get("openInterest", 0) for c in calls)
        put_oi  = sum(p.get("openInterest", 0) for p in puts)
        pc_ratio = round(put_oi / call_oi, 3) if call_oi > 0 else None

        # ATM IV (nächster Strike zum aktuellen Preis)
        spot = data.get("quote", {}).get("regularMarketPrice", 0)
        atm_calls = sorted(calls, key=lambda c: abs(c.get("strike", 0) - spot))
        atm_iv    = round(atm_calls[0].get("impliedVolatility", 0) * 100, 1) if atm_calls else None

        expirations = data.get("expirationDates", [])

        return {
            "ticker":           ticker.upper(),
            "put_call_ratio":   pc_ratio,
            "atm_iv":           atm_iv,           # % annualisiert
            "call_open_interest": call_oi,
            "put_open_interest":  put_oi,
            "expirations":      expirations[:6],  # nächste 6 Termine (Unix-Timestamps)
            "expiration_count": len(expirations),
        }
    except Exception as e:
        return {"ticker": ticker.upper(), "error": str(e)}


def get_relative_strength(ticker: str, time_range: str = "1D") -> dict:
    """
    Relative Stärke des Tickers vs. SPY (S&P 500 ETF).
    Normalisiert beide Zeitreihen auf Basis 100 am ersten Handelstag.
    """
    try:
        p = RANGE_MAP.get(time_range, RANGE_MAP["1D"])
        params = {"interval": p["interval"], "range": p["period"]}

        r_ticker = _get(f"{YF_BASE}/v8/finance/chart/{ticker}", params)
        r_spy    = _get(f"{YF_BASE}/v8/finance/chart/SPY", params)

        def extract(resp):
            res    = resp.json().get("chart", {}).get("result", [])
            if not res: return [], []
            times  = res[0].get("timestamp", [])
            closes = res[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
            return times, closes

        t_times,  t_closes  = extract(r_ticker)
        sp_times, sp_closes = extract(r_spy)

        # Gemeinsame Timestamps
        sp_map = {ts: c for ts, c in zip(sp_times, sp_closes) if ts and c}
        points = []
        base_t = base_sp = None
        for ts, tc in zip(t_times, t_closes):
            if ts is None or tc is None: continue
            sc = sp_map.get(ts)
            if sc is None: continue
            if base_t is None:
                base_t = tc; base_sp = sc
            norm_t  = round(tc  / base_t  * 100, 3)
            norm_sp = round(sc  / base_sp * 100, 3)
            points.append({"time": int(ts), "ticker": norm_t, "spy": norm_sp,
                           "rs": round(norm_t - norm_sp, 3)})

        return {"ticker": ticker.upper(), "range": time_range, "points": points}
    except Exception as e:
        return {"ticker": ticker.upper(), "range": time_range, "points": [], "error": str(e)}


def get_screener_data(tickers: list[str]) -> list[dict]:
    results = []
    for ticker in tickers:
        try:
            quote = get_quote(ticker)
            r = _get(f"{YF_BASE}/v10/finance/quoteSummary/{ticker}",
                     {"modules": "summaryDetail,defaultKeyStatistics,financialData,assetProfile"},
                     need_crumb=True, timeout=12)
            r.raise_for_status()
            res = r.json().get("quoteSummary", {}).get("result", [{}])[0]
            sd  = res.get("summaryDetail", {})
            ks  = res.get("defaultKeyStatistics", {})
            fd  = res.get("financialData", {})
            ap  = res.get("assetProfile", {})

            def raw(d, key):
                v = d.get(key, {})
                return v.get("raw") if isinstance(v, dict) else v

            price        = quote["price"]
            week52_high  = raw(sd, "fiftyTwoWeekHigh")
            week52_low   = raw(sd, "fiftyTwoWeekLow")

            # % vom 52W-Hoch/Tief
            pct_from_high = round((price - week52_high) / week52_high * 100, 2) if week52_high else None
            pct_from_low  = round((price - week52_low)  / week52_low  * 100, 2) if week52_low  else None

            results.append({
                "ticker": ticker.upper(), "name": ap.get("longName", ticker),
                "price": price, "change_pct": quote["change_pct"],
                "pe_ratio": raw(sd, "trailingPE"), "ps_ratio": raw(ks, "priceToSalesTrailing12Months"),
                "market_cap": raw(sd, "marketCap"), "dividend_yield": raw(sd, "dividendYield"),
                "eps": raw(ks, "trailingEps"), "debt_to_equity": raw(fd, "debtToEquity"),
                "revenue_growth": raw(fd, "revenueGrowth"), "sector": ap.get("sector"),
                "week52_high": week52_high, "week52_low": week52_low,
                "pct_from_high": pct_from_high, "pct_from_low": pct_from_low,
                "short_pct_float": raw(ks, "shortPercentOfFloat"),
                "beta": raw(ks, "beta"),
            })
        except Exception:
            continue
    return results



# ── Browse / Marktübersicht ──────────────────────────────────────────────────

BROWSE_GROUPS = {
    "Indizes":    ["^GSPC", "^IXIC", "^DJI", "^GDAXI", "^FTSE", "^N225", "^HSI", "^STOXX50E"],
    "Mega-Caps":  ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "BRK-B"],
    "Tech":       ["AMD", "INTC", "QCOM", "AVGO", "TSM", "ASML", "ORCL", "CRM", "SNOW", "NET"],
    "Finanzen":   ["JPM", "BAC", "GS", "MS", "BLK", "V", "MA", "PYPL", "AXP"],
    "Gesundheit": ["JNJ", "PFE", "LLY", "ABBV", "MRK", "UNH", "AMGN", "GILD", "TMO"],
    "Energie":    ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX"],
    "Rohstoffe":  ["GLD", "SLV", "USO", "GDX", "PDBC"],
    "Krypto-ETFs":["IBIT", "FBTC", "GBTC", "ETHA"],
}


def get_browse_data() -> dict:
    """Holt Kursdaten für alle Browse-Gruppen."""
    result = {}
    for group, tickers in BROWSE_GROUPS.items():
        group_data = []
        for ticker in tickers:
            try:
                r = _get(f"{YF_BASE}/v8/finance/chart/{ticker}", {"interval": "1d", "range": "5d"})
                if r.status_code != 200:
                    continue
                chart_result = r.json().get("chart", {}).get("result", [])
                if not chart_result:
                    continue
                meta  = chart_result[0]["meta"]
                price = round(float(meta.get("regularMarketPrice", 0)), 4)
                prev  = round(float(meta.get("chartPreviousClose", price)), 4)
                chg   = round(((price - prev) / prev) * 100, 2) if prev else 0
                group_data.append({
                    "ticker":     ticker,
                    "name":       meta.get("shortName", meta.get("symbol", ticker)),
                    "price":      price,
                    "change_pct": chg,
                    "currency":   meta.get("currency", "USD"),
                    "volume":     int(meta.get("regularMarketVolume", 0)),
                })
            except Exception:
                continue
        result[group] = group_data
    return result


# ── Sektor-Heatmap ──────────────────────────────────────────────────────────

SECTOR_ETFS = {
    "Technologie":    {"ticker": "XLK",  "weight": 29},
    "Finanzen":       {"ticker": "XLF",  "weight": 13},
    "Gesundheit":     {"ticker": "XLV",  "weight": 12},
    "Zyklisch":       {"ticker": "XLY",  "weight": 10},
    "Industrie":      {"ticker": "XLI",  "weight": 9},
    "Kommunikation":  {"ticker": "XLC",  "weight": 9},
    "Defensiv":       {"ticker": "XLP",  "weight": 6},
    "Energie":        {"ticker": "XLE",  "weight": 4},
    "Immobilien":     {"ticker": "XLRE", "weight": 3},
    "Versorger":      {"ticker": "XLU",  "weight": 3},
    "Rohstoffe":      {"ticker": "XLB",  "weight": 2},
}


def get_heatmap_data() -> list[dict]:
    """Kurs + %-Änderung für alle 11 GICS-Sektoren (SPDR ETFs)."""
    result = []
    for sector, info in SECTOR_ETFS.items():
        ticker = info["ticker"]
        try:
            r = _get(f"{YF_BASE}/v8/finance/chart/{ticker}", {"interval": "1d", "range": "5d"})
            if r.status_code != 200:
                result.append({"sector": sector, "ticker": ticker, "weight": info["weight"],
                                "price": None, "change_pct": None, "change_1w": None})
                continue
            chart_result = r.json().get("chart", {}).get("result", [])
            if not chart_result:
                continue
            meta    = chart_result[0]["meta"]
            closes  = chart_result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
            closes  = [c for c in closes if c is not None]
            price   = round(float(meta.get("regularMarketPrice", 0)), 2)
            prev    = round(float(meta.get("chartPreviousClose", price)), 2)
            chg_1d  = round(((price - prev) / prev) * 100, 2) if prev else 0
            # 1-Wochen-Performance (5 Handelstage)
            chg_1w  = round(((price - closes[0]) / closes[0]) * 100, 2) if len(closes) >= 2 and closes[0] else None
            result.append({
                "sector":     sector,
                "ticker":     ticker,
                "weight":     info["weight"],
                "price":      price,
                "change_pct": chg_1d,
                "change_1w":  chg_1w,
                "currency":   meta.get("currency", "USD"),
            })
        except Exception:
            result.append({"sector": sector, "ticker": ticker, "weight": info["weight"],
                            "price": None, "change_pct": None, "change_1w": None})
    return result

