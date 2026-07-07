"""
COT (Commitment of Traders) Report Service.
Lädt wöchentliche CFTC-Daten: Long/Short-Positionen von Commercials, Large Specs, Small Specs.
Quelle: CFTC.gov (öffentlich, kein API-Key nötig).
"""
import httpx
import csv
import io
from datetime import datetime

# CFTC Disaggregated Futures-Only Reports (wöchentlich Freitags)
CFTC_URL = "https://www.cftc.gov/dea/futures/fin_lf.htm"

# Mapping: Ticker → CFTC Market Name (für Futures)
COT_MARKET_MAP = {
    "ES=F":  "E-MINI S&P 500",
    "NQ=F":  "E-MINI NASDAQ-100",
    "YM=F":  "DOW JONES",
    "RTY=F": "RUSSELL 2000",
    "CL=F":  "CRUDE OIL",
    "NG=F":  "NATURAL GAS",
    "GC=F":  "GOLD",
    "SI=F":  "SILVER",
    "HG=F":  "COPPER",
    "ZC=F":  "CORN",
    "ZS=F":  "SOYBEANS",
    "ZW=F":  "WHEAT",
    "BTC=F": "BITCOIN",
    "ETH=F": "ETHER",
    "6E=F": "EURO FX",
    "6B=F": "BRITISH POUND",
    "6J=F": "JAPANESE YEN",
    "ZN=F": "10-YEAR NOTE",
    "ZB=F": "30-YEAR BOND",
    "DX=F": "U.S. DOLLAR INDEX",
}


def get_cot_report(ticker: str) -> dict:
    """
    Holt den letzten COT-Report für einen Futures-Ticker.
    Gibt Long/Short-Positionen der 3 Trader-Gruppen zurück.
    """
    market_name = COT_MARKET_MAP.get(ticker.upper())
    if not market_name:
        return {"ticker": ticker.upper(), "error": f"Kein COT-Market-Mapping für {ticker}"}

    try:
        # CFTC veröffentlicht als .htm oder .csv
        # Wir nutzen die fincom.txt (Disaggregated Futures-Only)
        url = "https://www.cftc.gov/sites/default/files/files/dea/futures/fin_lf.htm"
        resp = httpx.get(url, timeout=20, follow_redirects=True,
                         headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return {"ticker": ticker.upper(), "error": f"CFTC HTTP {resp.status_code}"}

        text = resp.text
        # Parse HTML-Tabelle (sehr simpel – CFTC hat tabellarische Daten)
        # Suche nach dem Market-Namen
        lines = text.split("\n")
        market_idx = -1
        for i, line in enumerate(lines):
            if market_name.lower() in line.lower():
                market_idx = i
                break

        if market_idx < 0:
            return {"ticker": ticker.upper(), "error": f"Market '{market_name}' nicht im COT-Report gefunden"}

        # Extrahiere Zahlen aus den folgenden Zeilen
        import re
        numbers = []
        for j in range(market_idx, min(market_idx + 20, len(lines))):
            nums = re.findall(r'[\d,]+(?:\.\d+)?', lines[j])
            numbers.extend([float(n.replace(",", "")) for n in nums if len(n.replace(",", "")) > 3])

        if len(numbers) < 12:
            return {"ticker": ticker.upper(), "error": "Nicht genug Daten im COT-Report"}

        # CFTC Disaggregated Format (vereinfacht):
        # Positionen: Long, Short, Spreading für jede Gruppe
        # Reihenfolge: Producer/Merchant/Processor (Commercials), Swap Dealers, Managed Money, Other Reportables
        return {
            "ticker":          ticker.upper(),
            "market_name":     market_name,
            "report_date":     datetime.utcnow().strftime("%Y-%m-%d"),
            "commercials": {
                "long":  int(numbers[0]) if len(numbers) > 0 else None,
                "short": int(numbers[2]) if len(numbers) > 2 else None,
            },
            "managed_money": {
                "long":  int(numbers[6]) if len(numbers) > 6 else None,
                "short": int(numbers[8]) if len(numbers) > 8 else None,
            },
            "other_reportables": {
                "long":  int(numbers[12]) if len(numbers) > 12 else None,
                "short": int(numbers[14]) if len(numbers) > 14 else None,
            },
            "source": "CFTC",
        }
    except Exception as e:
        return {"ticker": ticker.upper(), "error": str(e)}
