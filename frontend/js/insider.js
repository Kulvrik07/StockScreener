/**
 * insider.js – Alpha-Panel: Earnings, Insider-Transaktionen,
 *              Short Interest, Options Flow, Analysten-Empfehlungen
 */

const InsiderModule = (() => {

  function fmt(n, dec = 2) {
    if (n == null || isNaN(n)) return "–";
    return Number(n).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtBig(v) {
    if (v == null) return "–";
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + " Mrd";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + " Mio";
    return v.toLocaleString("de-DE");
  }

  // ── Earnings ──────────────────────────────────────────────────

  async function loadEarnings(ticker) {
    document.getElementById("earnings-content").innerHTML = "<p class='dim center loading'>Lade</p>";
    const badge = document.getElementById("earnings-next-badge");
    badge.classList.add("hidden");

    try {
      const [histResp, nextResp] = await Promise.all([
        apiFetch(`/earnings/${ticker}`),
        apiFetch(`/earnings/${ticker}/next`),
      ]);

      // Nächster Termin
      const next = nextResp.data;
      if (next && next.date) {
        badge.textContent = `Next: ${next.date}${next.hour === "bmo" ? " (vor Börsenbeginn)" : next.hour === "amc" ? " (nach Börsenschluss)" : ""}${next.eps_estimate != null ? " | Est. EPS: " + fmt(next.eps_estimate) : ""}`;
        badge.classList.remove("hidden");
      }

      // History-Tabelle
      const history = histResp.data || [];
      if (!history.length) {
        document.getElementById("earnings-content").innerHTML = "<p class='dim center'>Keine Daten verfügbar</p>";
        return;
      }

      const rows = history.map(e => {
        const beat = e.beat;
        const cls  = beat == null ? "" : beat ? "pos" : "neg";
        const icon = beat == null ? "" : beat ? "▲ Beat" : "▼ Miss";
        return `<tr>
          <td>${e.period || "–"}</td>
          <td class="num">${e.estimate != null ? fmt(e.estimate) : "–"}</td>
          <td class="num"><strong>${e.actual != null ? fmt(e.actual) : "–"}</strong></td>
          <td class="num ${cls}">${e.surprise != null ? (e.surprise >= 0 ? "+" : "") + fmt(e.surprise) + "%" : "–"} <small>${icon}</small></td>
        </tr>`;
      }).join("");

      document.getElementById("earnings-content").innerHTML = `
        <table class="alpha-table">
          <thead><tr><th>Quartal</th><th class="num">EPS Est.</th><th class="num">EPS Actual</th><th class="num">Surprise</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (e) {
      document.getElementById("earnings-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── Insider-Transaktionen ──────────────────────────────────────

  async function loadInsider(ticker) {
    document.getElementById("insider-content").innerHTML = "<p class='dim center loading'>Lade</p>";
    try {
      const resp  = await apiFetch(`/insider/${ticker}`);
      const items = resp.data || [];

      if (!items.length) {
        document.getElementById("insider-content").innerHTML = "<p class='dim center'>Keine Daten (Finnhub API-Key erforderlich)</p>";
        return;
      }

      const rows = items.map(it => {
        const cls  = it.is_buy ? "pos" : "neg";
        const type = it.is_buy ? "Kauf" : "Verkauf";
        return `<tr class="${cls}-row">
          <td>${it.date ? it.date.slice(0,10) : "–"}</td>
          <td><strong class="${cls}">${type}</strong></td>
          <td>${it.name || "–"}</td>
          <td class="dim" style="font-size:11px">${it.title || ""}</td>
          <td class="num">${it.shares ? it.shares.toLocaleString("de-DE") : "–"}</td>
          <td class="num">$${fmt(it.price)}</td>
          <td class="num"><strong>${it.value ? "$" + fmtBig(it.value) : "–"}</strong></td>
        </tr>`;
      }).join("");

      document.getElementById("insider-content").innerHTML = `
        <table class="alpha-table">
          <thead><tr><th>Datum</th><th>Art</th><th>Name</th><th>Titel</th><th class="num">Aktien</th><th class="num">Kurs</th><th class="num">Wert</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (e) {
      document.getElementById("insider-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── Short Interest ─────────────────────────────────────────────

  async function loadShort(ticker) {
    document.getElementById("short-content").innerHTML = "<p class='dim center loading'>Lade</p>";
    try {
      const d = await apiFetch(`/short/${ticker}`);
      if (d.error) {
        document.getElementById("short-content").innerHTML = `<p class='dim center'>${d.error}</p>`;
        return;
      }

      const shortPct = d.short_pct_float;
      const intensity = shortPct == null ? 0 : Math.min(shortPct / 30, 1);
      const barColor  = shortPct > 20 ? "#ef5350" : shortPct > 10 ? "#f9a825" : "#26a69a";

      document.getElementById("short-content").innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-item">
            <span class="kpi-label">Short Float %</span>
            <span class="kpi-val ${shortPct > 20 ? "neg" : shortPct > 10 ? "warn" : "pos"}">${shortPct != null ? fmt(shortPct) + "%" : "–"}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Days to Cover</span>
            <span class="kpi-val">${fmt(d.days_to_cover)}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Shares Short</span>
            <span class="kpi-val">${fmtBig(d.shares_short)}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Float</span>
            <span class="kpi-val">${fmtBig(d.float_shares)}</span>
          </div>
        </div>
        <div class="short-bar-wrap">
          <div class="short-bar" style="width:${Math.round(intensity * 100)}%; background:${barColor}"></div>
        </div>
        <p class="dim" style="font-size:11px; margin-top:4px">Short Float: ${shortPct != null ? fmt(shortPct) + "%" : "–"} (≥20% = gefährlich für Shorts)</p>`;
    } catch (e) {
      document.getElementById("short-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── Options Flow ───────────────────────────────────────────────

  async function loadOptions(ticker) {
    document.getElementById("options-content").innerHTML = "<p class='dim center loading'>Lade</p>";
    try {
      const d = await apiFetch(`/options/${ticker}`);
      if (d.error) {
        document.getElementById("options-content").innerHTML = `<p class='dim center'>${d.error}</p>`;
        return;
      }

      const pcr  = d.put_call_ratio;
      const mood = pcr == null ? "neutral" : pcr > 1.2 ? "Bearish" : pcr < 0.7 ? "Bullish" : "Neutral";
      const moodCls = pcr == null ? "" : pcr > 1.2 ? "neg" : pcr < 0.7 ? "pos" : "";

      document.getElementById("options-content").innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-item">
            <span class="kpi-label">Put/Call-Ratio</span>
            <span class="kpi-val ${moodCls}">${pcr != null ? fmt(pcr, 3) : "–"}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Market Mood</span>
            <span class="kpi-val ${moodCls}">${mood}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">ATM IV</span>
            <span class="kpi-val">${d.atm_iv != null ? d.atm_iv + "%" : "–"}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Call OI</span>
            <span class="kpi-val pos">${fmtBig(d.call_open_interest)}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Put OI</span>
            <span class="kpi-val neg">${fmtBig(d.put_open_interest)}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-label">Ablauftermine</span>
            <span class="kpi-val">${d.expiration_count || 0}</span>
          </div>
        </div>`;
    } catch (e) {
      document.getElementById("options-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── Analysten-Empfehlungen ─────────────────────────────────────

  async function loadRecs(ticker) {
    document.getElementById("recs-content").innerHTML = "<p class='dim center loading'>Lade</p>";
    try {
      const resp  = await apiFetch(`/insider/${ticker}/recommendations`);
      const items = resp.data || [];

      if (!items.length) {
        document.getElementById("recs-content").innerHTML = "<p class='dim center'>Keine Daten (Finnhub API-Key erforderlich)</p>";
        return;
      }

      const bars = items.map(it => {
        const total = (it.strong_buy + it.buy + it.hold + it.sell + it.strong_sell) || 1;
        const pctBuy  = Math.round((it.strong_buy + it.buy) / total * 100);
        const pctHold = Math.round(it.hold / total * 100);
        const pctSell = Math.round((it.sell + it.strong_sell) / total * 100);
        return `
          <div class="rec-row">
            <span class="rec-period">${it.period ? it.period.slice(0,7) : "–"}</span>
            <div class="rec-bar-wrap">
              <div class="rec-seg buy" style="width:${pctBuy}%" title="Buy: ${it.strong_buy + it.buy}"></div>
              <div class="rec-seg hold" style="width:${pctHold}%" title="Hold: ${it.hold}"></div>
              <div class="rec-seg sell" style="width:${pctSell}%" title="Sell: ${it.sell + it.strong_sell}"></div>
            </div>
            <span class="rec-summary pos">${it.strong_buy + it.buy} Kauf</span>
            <span class="rec-summary dim">${it.hold} Neutral</span>
            <span class="rec-summary neg">${it.sell + it.strong_sell} Verk.</span>
          </div>`;
      }).join("");

      document.getElementById("recs-content").innerHTML = `<div class="rec-list">${bars}</div>`;
    } catch (e) {
      document.getElementById("recs-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── Öffentliche API ────────────────────────────────────────────

  // ── Gamma Exposure (GEX) ──────────────────────────────────────

  async function loadGEX(ticker) {
    const el = document.getElementById("gex-content");
    el.innerHTML = "<p class='dim center loading'>Lade GEX…</p>";
    try {
      const d = await apiFetch(`/gex/${ticker}`);
      if (d.error) { el.innerHTML = `<p class='dim center'>${d.error}</p>`; return; }

      const gexBn  = d.total_gex / 1e9;
      const flip   = d.flip_level;
      const spot   = d.spot;
      const regime = gexBn >= 0 ? "Long Gamma (stabilisierend)" : "Short Gamma (volatil)";
      const cls    = gexBn >= 0 ? "pos" : "neg";

      // Top Strikes als Balken
      const strikes = (d.strikes || []).slice(-20).reverse();
      const maxAbs = Math.max(...strikes.map(s => Math.abs(s.gex)), 1);
      const bars = strikes.map(s => {
        const pct = Math.abs(s.gex) / maxAbs * 100;
        const isPos = s.gex >= 0;
        return `<div class="gex-bar-row">
          <span class="gex-strike">${s.strike}</span>
          <div class="gex-bar-track">
            <div class="gex-bar ${isPos ? 'pos' : 'neg'}" style="width:${pct}%"></div>
          </div>
          <span class="gex-val ${isPos ? 'pos' : 'neg'}">${(s.gex/1e6).toFixed(1)}M</span>
        </div>`;
      }).join("");

      el.innerHTML = `
        <div class="gex-summary">
          <div class="gex-kpi"><span class="dim">Total GEX</span><span class="${cls}">${gexBn >= 0 ? '+' : ''}${gexBn.toFixed(2)} Mrd $</span></div>
          <div class="gex-kpi"><span class="dim">Regime</span><span class="${cls}">${regime}</span></div>
          <div class="gex-kpi"><span class="dim">Spot</span><span>$${spot}</span></div>
          <div class="gex-kpi"><span class="dim">Gamma Flip</span><span class="${flip ? 'neg' : 'dim'}">${flip ? '$' + flip : '–'}</span></div>
          <div class="gex-kpi"><span class="dim">ATM IV</span><span>${d.iv || '–'}%</span></div>
        </div>
        ${flip ? `<p class="dim center" style="margin:8px 0">⚠️ Gamma Flip bei <strong>$${flip}</strong> – darunter werden Dealer short Gamma (Volatilität ↑)</p>` : ""}
        <div class="gex-bars">${bars}</div>
      `;
    } catch(e) {
      el.innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  // ── COT Report ────────────────────────────────────────────────

  async function loadCOT(ticker) {
    const el = document.getElementById("cot-content");
    el.innerHTML = "<p class='dim center loading'>Lade COT…</p>";
    try {
      const d = await apiFetch(`/cot/${ticker}`);
      if (d.error) { el.innerHTML = `<p class='dim center'>${d.error}</p>`; return; }

      const groups = [
        { name: "Commercials (Hedger)", data: d.commercials },
        { name: "Managed Money (Fonds)", data: d.managed_money },
        { name: "Other Reportables", data: d.other_reportables },
      ];

      const rows = groups.map(g => {
        if (!g.data) return "";
        const net = (g.data.long || 0) - (g.data.short || 0);
        const cls = net >= 0 ? "pos" : "neg";
        return `<tr>
          <td>${g.name}</td>
          <td class="pos">${fmtBig(g.data.long)}</td>
          <td class="neg">${fmtBig(g.data.short)}</td>
          <td class="${cls}">${net >= 0 ? '+' : ''}${fmtBig(net)}</td>
        </tr>`;
      }).join("");

      el.innerHTML = `
        <p class="dim" style="margin:0 0 8px">${d.market_name} – Stand: ${d.report_date}</p>
        <table class="cot-table">
          <thead><tr><th>Gruppe</th><th>Long</th><th>Short</th><th>Net</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="dim center" style="margin:8px 0;font-size:11px">Quelle: CFTC (wöchentlich, Freitags)</p>
      `;
    } catch(e) {
      el.innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  function load(ticker) {
    loadEarnings(ticker);
    loadInsider(ticker);
    loadShort(ticker);
    loadOptions(ticker);
    loadRecs(ticker);
    loadGEX(ticker);
    loadCOT(ticker);
  }

  return { load };
})();
