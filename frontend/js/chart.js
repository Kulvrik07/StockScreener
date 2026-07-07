/**
 * chart.js – Candlestick-Chart + alle Indikatoren via lightweight-charts v4
 * Indikatoren: Vol, SMA20/50/200, EMA9/20, BB, VWAP, PSAR, RSI, Stoch,
 *              MACD, CCI, ATR, OBV, Williams %R, RS/SPY
 * Zeichentools: Horizontale Linien, Fibonacci-Retracement
 */

const ChartModule = (() => {
  let mainChart  = null;
  let rsChart    = null;      // RS vs SPY
  let rsiChart   = null;
  let macdChart  = null;
  let auxChart   = null;      // CCI, ATR, OBV, Williams, Stoch

  // Zeichentools
  let activeTool    = "none";   // "none" | "hline" | "fib"
  let hLines        = [];       // { series, price } – horizontale Linien
  let fibLines      = [];       // fibonacci series list
  let clickCount    = 0;
  let firstClickPrice = null;
  let candleSeries  = null;
  let currentCandles = [];

  const BG      = "#131722";
  const GRID    = "#1e222d";
  const TEXT    = "#787b86";
  const BORDER  = "#2e3241";
  const GREEN   = "#26a69a";
  const RED     = "#ef5350";
  const BLUE    = "#2962ff";
  const ORANGE  = "#f9a825";
  const PURPLE  = "#9c27b0";
  const CYAN    = "#00bcd4";
  const LIME    = "#8bc34a";
  const PINK    = "#e91e63";

  const baseOpts = () => ({
    layout:    { background: { color: BG }, textColor: TEXT },
    grid:      { vertLines: { color: GRID }, horzLines: { color: GRID } },
    crosshair: { mode: 1 },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: BORDER },
  });

  // ─────────── Indikator-Berechnungen ───────────

  function sma(arr, n) {
    return arr.map((_, i) => i < n - 1 ? null : arr.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
  }

  function ema(arr, n) {
    const k = 2 / (n + 1), out = [];
    let prev = null;
    arr.forEach((v, i) => {
      if (v == null) { out.push(null); return; }
      if (prev == null) { if (i >= n - 1) { prev = arr.slice(0, n).reduce((a, b) => a + b, 0) / n; out.push(prev); } else { out.push(null); } return; }
      prev = v * k + prev * (1 - k); out.push(prev);
    });
    return out;
  }

  function rsi(closes, n = 14) {
    const out = Array(n).fill(null);
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; d >= 0 ? g += d : l -= d; }
    g /= n; l /= n;
    out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
    }
    return out;
  }

  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const ef = ema(closes, fast), es = ema(closes, slow);
    const line = ef.map((v, i) => v != null && es[i] != null ? v - es[i] : null);
    const valid = line.filter(v => v != null);
    const sigRaw = ema(valid, signal);
    const sigPad = Array(line.length - sigRaw.length).fill(null);
    const sig = [...sigPad, ...sigRaw];
    const hist = line.map((v, i) => v != null && sig[i] != null ? v - sig[i] : null);
    return { line, sig, hist };
  }

  function bb(closes, n = 20, k = 2) {
    return sma(closes, n).map((m, i) => {
      if (m == null) return { upper: null, mid: null, lower: null };
      const sl = closes.slice(i - n + 1, i + 1);
      const std = Math.sqrt(sl.reduce((a, c) => a + (c - m) ** 2, 0) / n);
      return { upper: m + k * std, mid: m, lower: m - k * std };
    });
  }

  function vwap(candles) {
    // VWAP zurückgesetzt pro Handelstag (tagesübergreifend: rollierende Version)
    let cumTP = 0, cumVol = 0;
    return candles.map(c => {
      const tp = (c.high + c.low + c.close) / 3;
      cumTP  += tp * c.volume;
      cumVol += c.volume;
      return cumVol > 0 ? cumTP / cumVol : null;
    });
  }

  function parabolicSAR(candles, step = 0.02, max = 0.2) {
    if (candles.length < 2) return candles.map(() => null);
    const out = Array(candles.length).fill(null);
    let bull   = true;
    let sar    = candles[0].low;
    let ep     = candles[0].high;
    let af     = step;
    out[0]     = sar;
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1], cur = candles[i];
      sar = sar + af * (ep - sar);
      if (bull) {
        sar = Math.min(sar, prev.low, i >= 2 ? candles[i - 2].low : prev.low);
        if (cur.low < sar) { bull = false; sar = ep; ep = cur.low; af = step; }
        else { if (cur.high > ep) { ep = cur.high; af = Math.min(af + step, max); } }
      } else {
        sar = Math.max(sar, prev.high, i >= 2 ? candles[i - 2].high : prev.high);
        if (cur.high > sar) { bull = true; sar = ep; ep = cur.high; af = step; }
        else { if (cur.low < ep) { ep = cur.low; af = Math.min(af + step, max); } }
      }
      out[i] = sar;
    }
    return out;
  }

  function stochastic(candles, k = 14, d = 3) {
    const kLine = candles.map((_, i) => {
      if (i < k - 1) return null;
      const sl  = candles.slice(i - k + 1, i + 1);
      const hi  = Math.max(...sl.map(c => c.high));
      const lo  = Math.min(...sl.map(c => c.low));
      const cur = candles[i].close;
      return hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100;
    });
    const dLine = sma(kLine.filter(v => v != null), d);
    const dPad  = Array(kLine.length - dLine.length).fill(null);
    return { k: kLine, d: [...dPad, ...dLine] };
  }

  function cci(candles, n = 20) {
    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    return tp.map((_, i) => {
      if (i < n - 1) return null;
      const sl  = tp.slice(i - n + 1, i + 1);
      const mean = sl.reduce((a, b) => a + b, 0) / n;
      const md   = sl.reduce((a, b) => a + Math.abs(b - mean), 0) / n;
      return md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
    });
  }

  function atr(candles, n = 14) {
    const tr = candles.map((c, i) => {
      if (i === 0) return c.high - c.low;
      const prev = candles[i - 1].close;
      return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    });
    return sma(tr, n);
  }

  function obv(candles) {
    let v = 0;
    return candles.map((c, i) => {
      if (i === 0) { v = c.volume; return v; }
      v += c.close > candles[i - 1].close ? c.volume : c.close < candles[i - 1].close ? -c.volume : 0;
      return v;
    });
  }

  function williamsR(candles, n = 14) {
    return candles.map((_, i) => {
      if (i < n - 1) return null;
      const sl = candles.slice(i - n + 1, i + 1);
      const hi = Math.max(...sl.map(c => c.high));
      const lo = Math.min(...sl.map(c => c.low));
      return hi === lo ? -50 : ((hi - candles[i].close) / (hi - lo)) * -100;
    });
  }

  // Cumulative Volume Delta: Summe über (close>open ? +vol : -vol)
  function cvd(candles) {
    let v = 0;
    return candles.map(c => {
      v += c.close >= c.open ? c.volume : -c.volume;
      return v;
    });
  }

  // Volume Profile: Volumen pro Preis-Level (Histogram rechts)
  function volumeProfile(candles, bins = 24) {
    const lows  = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const min = Math.min(...lows), max = Math.max(...highs);
    if (max === min) return [];
    const step = (max - min) / bins;
    const levels = Array.from({ length: bins }, (_, i) => ({
      price: min + step * (i + 0.5),
      vol: 0, buyVol: 0, sellVol: 0,
    }));
    candles.forEach(c => {
      const startBin = Math.floor((c.low - min) / step);
      const endBin   = Math.floor((c.high - min) / step);
      const isBuy    = c.close >= c.open;
      for (let b = Math.max(0, startBin); b <= Math.min(bins - 1, endBin); b++) {
        levels[b].vol += c.volume / (endBin - startBin + 1);
        if (isBuy) levels[b].buyVol += c.volume / (endBin - startBin + 1);
        else levels[b].sellVol += c.volume / (endBin - startBin + 1);
      }
    });
    return levels;
  }

  // ─────────── Chart-Hilfsfunktionen ───────────

  function mkChart(el, opts = {}) {
    const c = LightweightCharts.createChart(el, {
      ...baseOpts(), ...opts,
      width: el.clientWidth, height: el.clientHeight,
    });
    new ResizeObserver(() => c.applyOptions({ width: el.clientWidth, height: el.clientHeight })).observe(el);
    return c;
  }

  function mkLine(chart, color, title, opts = {}) {
    return chart.addLineSeries({ color, lineWidth: 1.5, title, priceLineVisible: false, lastValueVisible: true, ...opts });
  }

  function setData(series, times, vals) {
    series.setData(times.map((t, i) => vals[i] != null ? { time: t, value: vals[i] } : null).filter(Boolean));
  }

  function syncTimeScale(source, ...targets) {
    source.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (!r) return;
      targets.forEach(t => t && t.timeScale().setVisibleLogicalRange(r));
    });
  }

  function destroyAll() {
    [mainChart, rsChart, rsiChart, macdChart, auxChart].forEach(c => c && c.remove());
    mainChart = rsChart = rsiChart = macdChart = auxChart = null;
    hLines = []; fibLines = [];
    candleSeries = null; currentCandles = [];
  }

  // ─────────── Zeichentools ───────────

  function initDrawingTools() {
    document.querySelectorAll(".draw-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        if (tool === "clear") { clearDrawings(); return; }
        activeTool = activeTool === tool ? "none" : tool;
        document.querySelectorAll(".draw-btn").forEach(b => b.classList.remove("active"));
        if (activeTool !== "none") btn.classList.add("active");
        document.getElementById("chart-main").style.cursor =
          activeTool !== "none" ? "crosshair" : "default";
      });
    });
  }

  function clearDrawings() {
    hLines.forEach(h => { try { mainChart.removeSeries(h.series); } catch(_) {} });
    fibLines.forEach(s => { try { mainChart.removeSeries(s); } catch(_) {} });
    hLines = []; fibLines = [];
    clickCount = 0; firstClickPrice = null;
  }

  function addHorizontalLine(price) {
    if (!mainChart || !currentCandles.length) return;
    const times = currentCandles.map(c => c.time);
    const s = mainChart.addLineSeries({
      color: "#f9a825", lineWidth: 1, lineStyle: 2,
      priceLineVisible: false, lastValueVisible: true, title: `$${price.toFixed(2)}`,
    });
    s.setData([{ time: times[0], value: price }, { time: times[times.length - 1], value: price }]);
    hLines.push({ series: s, price });
  }

  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const FIB_COLORS = ["#ef5350","#f9a825","#26a69a","#2962ff","#9c27b0","#00bcd4","#ef5350"];

  function addFibRetracement(highPrice, lowPrice) {
    if (!mainChart || !currentCandles.length) return;
    const times = currentCandles.map(c => c.time);
    const range = highPrice - lowPrice;
    FIB_LEVELS.forEach((lvl, i) => {
      const price = highPrice - range * lvl;
      const s = mainChart.addLineSeries({
        color: FIB_COLORS[i], lineWidth: 1, lineStyle: 1,
        priceLineVisible: false, lastValueVisible: true,
        title: `Fib ${(lvl * 100).toFixed(1)}%`,
      });
      s.setData([{ time: times[0], value: price }, { time: times[times.length - 1], value: price }]);
      fibLines.push(s);
    });
  }

  function onChartClick(param) {
    if (activeTool === "none" || !param.point) return;
    const price = mainChart.priceScale("right").coordinateToPrice(param.point.y);
    if (price == null) return;

    if (activeTool === "hline") {
      addHorizontalLine(price);
    } else if (activeTool === "fib") {
      if (clickCount === 0) {
        firstClickPrice = price;
        clickCount = 1;
      } else {
        addFibRetracement(Math.max(firstClickPrice, price), Math.min(firstClickPrice, price));
        clickCount = 0; firstClickPrice = null;
        activeTool = "none";
        document.querySelectorAll(".draw-btn").forEach(b => b.classList.remove("active"));
        document.getElementById("chart-main").style.cursor = "default";
      }
    }
  }

  // ─────────── Earnings-Marker ───────────

  async function loadEarningsMarkers(ticker) {
    try {
      const resp    = await apiFetch(`/earnings/${ticker}`);
      const history = resp.data || [];
      if (!candleSeries || !currentCandles.length) return;

      const timeSet = new Set(currentCandles.map(c => c.time));
      const markers = [];

      history.forEach(e => {
        if (!e.period) return;
        // Periode "2024-09-29" → Unix-Timestamp
        const ts = Math.floor(new Date(e.period).getTime() / 1000);
        // Nächsten verfügbaren Timestamp im Chart finden
        const near = currentCandles.reduce((best, c) =>
          Math.abs(c.time - ts) < Math.abs(best.time - ts) ? c : best, currentCandles[0]);
        if (!near || Math.abs(near.time - ts) > 7 * 86400) return;

        const beat = e.beat;
        markers.push({
          time:     near.time,
          position: "aboveBar",
          color:    beat == null ? "#787b86" : beat ? GREEN : RED,
          shape:    "arrowDown",
          text:     `E: ${beat == null ? "?" : beat ? "▲" : "▼"}${e.surprise != null ? " " + (e.surprise >= 0 ? "+" : "") + e.surprise.toFixed(1) + "%" : ""}`,
          size:     1,
        });
      });

      if (markers.length) candleSeries.setMarkers(markers);
    } catch(_) {}
  }

  // ─────────── RS/SPY Sub-Chart ───────────

  async function loadRS(ticker, range, rsEl) {
    try {
      const resp   = await apiFetch(`/rs/${ticker}?range=${encodeURIComponent(range)}`);
      const points = resp.points || [];
      if (!points.length || !rsChart) return;

      const rsLine = mkLine(rsChart, BLUE,   ticker, { lineWidth: 2 });
      const spLine = mkLine(rsChart, "#546e7a", "SPY", { lineWidth: 1, lineStyle: 2 });
      rsLine.setData(points.map(p => ({ time: p.time, value: p.ticker })));
      spLine.setData(points.map(p => ({ time: p.time, value: p.spy })));

      // Zero-line bei 100
      const base = rsChart.addLineSeries({ color: "#ffffff22", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, title: "" });
      base.setData([{ time: points[0].time, value: 100 }, { time: points[points.length - 1].time, value: 100 }]);

      syncTimeScale(mainChart, rsChart);
    } catch(_) {}
  }

  // ─────────── Haupt-Load-Funktion ───────────

  // Trackt ob der aktuelle load-Aufruf ein Poll-Update ist (kein Rebuild)
  let _isPollUpdate = false;
  let _lastTicker   = null;
  let _lastRange    = null;
  // Referenzen auf Volume-Series für Updates
  let volSeries     = null;

  async function load(ticker, range, isPoll = false) {
    if (State.activeView !== "chart") return;
    const mainEl = document.getElementById("chart-main");
    const rsEl   = document.getElementById("chart-rs");
    const rsiEl  = document.getElementById("chart-rsi");
    const macdEl = document.getElementById("chart-macd");
    const auxEl  = document.getElementById("chart-aux");

    // Poll-Update: nur Daten updaten, Chart nicht zerstören
    if (isPoll && mainChart && _lastTicker === ticker && _lastRange === range) {
      try {
        const data = await apiFetch(`/chart/${ticker}?range=${encodeURIComponent(range)}`);
        if (!data.candles || data.candles.length === 0) return;
        const C = data.candles;
        currentCandles = C;
        // Nur die letzte Kerze updaten (lightweight-charts update() = letzte Kerze ersetzen)
        const last = C[C.length - 1];
        if (last) {
          candleSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
          if (volSeries) {
            volSeries.update({ time: last.time, value: last.volume, color: last.close >= last.open ? "#26a69a44" : "#ef535044" });
          }
        }
        // Falls eine NEUE Kerze dazukam (Zeit unterschiedlich), update() fügt sie automatisch hinzu
        return;  // KEIN fitContent, KEIN destroyAll → Zoom bleibt erhalten
      } catch(e) { return; }
    }

    _lastTicker = ticker;
    _lastRange  = range;

    if (!mainChart) mainEl.innerHTML = "<div id='chart-placeholder'><span class='loading'>Lade Chart</span></div>";

    try {
      const data = await apiFetch(`/chart/${ticker}?range=${encodeURIComponent(range)}`);
      if (!data.candles || data.candles.length === 0) {
        mainEl.innerHTML = "<div id='chart-placeholder'>Keine Daten für diesen Zeitrahmen</div>";
        return;
      }

      destroyAll();
      mainEl.innerHTML = "";

      const inds   = State.activeInds;
      const showRS    = inds.has("rs");
      const showRSI   = inds.has("rsi");
      const showStoch = inds.has("stoch");
      const showMACD  = inds.has("macd");
      const showAux   = inds.has("cci") || inds.has("atr") || inds.has("obv") || inds.has("williams") || inds.has("cvd");

      rsEl.classList.toggle("hidden",   !showRS);
      rsiEl.classList.toggle("hidden",  !(showRSI || showStoch));
      macdEl.classList.toggle("hidden", !showMACD);
      auxEl.classList.toggle("hidden",  !showAux);

      // ── Main chart ──
      mainChart = mkChart(mainEl);
      candleSeries = mainChart.addCandlestickSeries({
        upColor: GREEN, downColor: RED,
        borderUpColor: GREEN, borderDownColor: RED,
        wickUpColor: GREEN, wickDownColor: RED,
      });

      const C = data.candles;
      currentCandles = C;
      const T = C.map(c => c.time);
      const closes = C.map(c => c.close);

      candleSeries.setData(C.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));

      // Zeichentools aktivieren
      mainChart.subscribeClick(onChartClick);

      // Earnings-Marker asynchron nachladen (nur bei Daily+)
      if (!["1m","2m","5m","15m","30m","1H"].includes(range)) {
        loadEarningsMarkers(ticker);
      }

      // Volume
      if (inds.has("volume")) {
        volSeries = mainChart.addHistogramSeries({
          priceFormat: { type: "volume" }, priceScaleId: "vol",
          scaleMargins: { top: 0.85, bottom: 0 },
        });
        volSeries.setData(C.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "#26a69a44" : "#ef535044" })));
      } else { volSeries = null; }

      // SMA 20
      if (inds.has("sma20")) { const s = mkLine(mainChart, BLUE, "SMA20"); setData(s, T, sma(closes, 20)); }
      // SMA 50
      if (inds.has("sma50")) { const s = mkLine(mainChart, ORANGE, "SMA50"); setData(s, T, sma(closes, 50)); }
      // SMA 200
      if (inds.has("sma200")) { const s = mkLine(mainChart, PINK, "SMA200", { lineWidth: 2 }); setData(s, T, sma(closes, 200)); }
      // EMA 9
      if (inds.has("ema9")) { const s = mkLine(mainChart, LIME, "EMA9"); setData(s, T, ema(closes, 9)); }
      // EMA 20
      if (inds.has("ema20")) { const s = mkLine(mainChart, PURPLE, "EMA20"); setData(s, T, ema(closes, 20)); }

      // Bollinger Bands
      if (inds.has("bb")) {
        const bands = bb(closes);
        const upper = mkLine(mainChart, "#546e7a", "BB+", { lineStyle: 2, lineWidth: 1 });
        const mid   = mkLine(mainChart, "#546e7a88", "BB mid", { lineWidth: 1 });
        const lower = mkLine(mainChart, "#546e7a", "BB-", { lineStyle: 2, lineWidth: 1 });
        setData(upper, T, bands.map(b => b.upper));
        setData(mid,   T, bands.map(b => b.mid));
        setData(lower, T, bands.map(b => b.lower));
      }

      // VWAP
      if (inds.has("vwap")) {
        const s = mkLine(mainChart, CYAN, "VWAP", { lineWidth: 2 });
        setData(s, T, vwap(C));
      }

      // Parabolic SAR – als Marker auf der Candlestick-Serie
      if (inds.has("psar")) {
        const sarVals = parabolicSAR(C);
        const markers = T
          .map((t, i) => sarVals[i] != null ? {
            time: t,
            position: sarVals[i] < C[i].close ? "belowBar" : "aboveBar",
            color: ORANGE,
            shape: "circle",
            size: 0.5,
          } : null)
          .filter(Boolean);
        candleSeries.setMarkers(markers);
      }

      // Nach Rebuild: einmal fitContent, damit alle Kerzen sichtbar sind
      mainChart.timeScale().fitContent();

      // ── RSI / Stochastic (geteilt) ──
      if (showRSI || showStoch) {
        rsiEl.innerHTML = "";
        rsiChart = mkChart(rsiEl, { timeScale: { ...baseOpts().timeScale, visible: false } });

        if (showRSI) {
          const rs = mkLine(rsiChart, PURPLE, "RSI14");
          setData(rs, T, rsi(closes));
          // Overbought/Oversold
          [[30, "#ef535055"], [70, "#26a69a55"]].forEach(([lvl, col]) => {
            const hl = rsiChart.addLineSeries({ color: col, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
            hl.setData([{ time: T[0], value: lvl }, { time: T[T.length - 1], value: lvl }]);
          });
        }
        if (showStoch) {
          const { k: kLine, d: dLine } = stochastic(C);
          const sk = mkLine(rsiChart, BLUE,   "Stoch %K");
          const sd = mkLine(rsiChart, ORANGE, "Stoch %D");
          setData(sk, T, kLine);
          setData(sd, T, dLine);
        }
        syncTimeScale(mainChart, rsiChart);
      }

      // ── MACD ──
      if (showMACD) {
        macdEl.innerHTML = "";
        macdChart = mkChart(macdEl, { timeScale: { ...baseOpts().timeScale, visible: false } });
        const { line, sig, hist } = macd(closes);
        const ml = mkLine(macdChart, BLUE,   "MACD");
        const sl = mkLine(macdChart, ORANGE, "Signal");
        setData(ml, T, line);
        setData(sl, T, sig);
        const hs = macdChart.addHistogramSeries({ priceScaleId: "hist", priceLineVisible: false });
        hs.setData(T.map((t, i) => hist[i] != null ? { time: t, value: hist[i], color: hist[i] >= 0 ? "#26a69a66" : "#ef535066" } : null).filter(Boolean));
        syncTimeScale(mainChart, macdChart);
      }

      // ── Aux (CCI / ATR / OBV / Williams / CVD) ──
      const showCVD = inds.has("cvd");
      if (showAux || showCVD) {
        auxEl.innerHTML = "";
        auxChart = mkChart(auxEl, { timeScale: { ...baseOpts().timeScale, visible: false } });

        if (inds.has("cci")) {
          const s = mkLine(auxChart, CYAN, "CCI20");
          setData(s, T, cci(C));
        }
        if (inds.has("atr")) {
          const s = mkLine(auxChart, ORANGE, "ATR14");
          setData(s, T, atr(C));
        }
        if (inds.has("obv")) {
          const s = mkLine(auxChart, LIME, "OBV");
          setData(s, T, obv(C));
        }
        if (inds.has("williams")) {
          const s = mkLine(auxChart, PINK, "%R14");
          setData(s, T, williamsR(C));
        }
        if (showCVD) {
          const s = mkLine(auxChart, "#ff9800", "CVD", { lineWidth: 2 });
          setData(s, T, cvd(C));
        }
        syncTimeScale(mainChart, auxChart);
      } else {
        auxEl.classList.add("hidden");
      }

      // ── Volume Profile (Overlay auf Main-Chart) ──
      if (inds.has("vprofile")) {
        const levels = volumeProfile(C, 30);
        const maxVol = Math.max(...levels.map(l => l.vol));
        const vpSeries = mainChart.addHistogramSeries({
          priceScaleId: "vp",
          priceFormat: { type: "volume" },
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
        // Als horizontales Histogramm: jeder Preis-Level bekommt einen Datenpunkt
        const vpData = levels.map(l => ({
          time: T[0],   // an den Anfang setzen
          value: l.vol,
          color: l.buyVol >= l.sellVol ? "#26a69a33" : "#ef535033",
        }));
        // Volume Profile als separate Series rechts
        vpSeries.setData(vpData);
      }

      // ── RS vs SPY ──
      if (showRS) {
        rsEl.innerHTML = "";
        rsChart = mkChart(rsEl, { timeScale: { ...baseOpts().timeScale, visible: false } });
        loadRS(ticker, range, rsEl);   // async, lädt parallel
      }

    } catch(e) {
      console.error("Chart error:", e);
      mainEl.innerHTML = `<div id="chart-placeholder">Fehler: ${e.message}</div>`;
    }
  }

  // Drawing Tools einmalig beim Start initialisieren
  document.addEventListener("DOMContentLoaded", initDrawingTools);

  return { load };
})();
