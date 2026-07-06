/**
 * screener.js – Multi-Filter-Screener mit sortierbarer Ergebnistabelle
 */

const ScreenerModule = (() => {
  let lastResults = [];
  let sortCol     = "market_cap";
  let sortDesc    = true;

  const COL_MAP = {
    ticker:         { label: "Ticker",        fmt: v => v,                  cls: "ticker-cell" },
    name:           { label: "Name",           fmt: v => v || "–",           cls: "" },
    price:          { label: "Kurs ($)",       fmt: v => "$" + fmt(v),       cls: "num" },
    change_pct:     { label: "Änderung %",     fmt: v => (v >= 0 ? "+" : "") + fmt(v) + "%", cls: "num", colorFn: v => changeClass(v) },
    pe_ratio:       { label: "KGV",            fmt: v => v != null ? fmt(v) : "–", cls: "num" },
    ps_ratio:       { label: "KUV",            fmt: v => v != null ? fmt(v) : "–", cls: "num" },
    market_cap:     { label: "Marktkap.",      fmt: v => fmtBig(v),          cls: "num" },
    dividend_yield: { label: "Div.-Rendite",   fmt: v => v != null ? fmtPct(v) : "–", cls: "num" },
    eps:            { label: "EPS",            fmt: v => v != null ? "$" + fmt(v) : "–", cls: "num" },
    debt_to_equity: { label: "Verschuld.",     fmt: v => v != null ? fmt(v) : "–", cls: "num" },
    revenue_growth: { label: "Umsatzwachst.",  fmt: v => v != null ? fmtPct(v) : "–", cls: "num", colorFn: v => v > 0 ? "change-up" : v < 0 ? "change-down" : "" },
    pct_from_high:  { label: "vs 52W-Hoch",   fmt: v => v != null ? (v >= 0 ? "+" : "") + fmt(v) + "%" : "–", cls: "num", colorFn: v => v > -5 ? "change-up" : "" },
    pct_from_low:   { label: "vs 52W-Tief",   fmt: v => v != null ? "+" + fmt(v) + "%" : "–", cls: "num" },
    beta:           { label: "Beta",           fmt: v => v != null ? fmt(v) : "–", cls: "num" },
    sector:         { label: "Sektor",         fmt: v => v || "–",           cls: "" },
  };

  function buildRequestBody() {
    const val = id => document.getElementById(id).value.trim();
    const num = id => { const v = parseFloat(val(id)); return isNaN(v) ? null : v; };

    return {
      pe_max:          num("f-pe-max"),
      pe_min:          num("f-pe-min"),
      ps_max:          num("f-ps-max"),
      mcap_min:        num("f-mcap-min") != null ? num("f-mcap-min") * 1e9 : null,
      div_yield_min:   num("f-div-min")  != null ? num("f-div-min")  / 100 : null,
      eps_min:         num("f-eps-min"),
      debt_eq_max:     num("f-debt-max"),
      rev_growth_min:  num("f-revgrowth-min") != null ? num("f-revgrowth-min") / 100 : null,
      near_52w_high:   num("f-52h"),
      near_52w_low:    num("f-52l"),
      short_float_max: num("f-short"),
      beta_max:        num("f-beta-max"),
      beta_min:        num("f-beta-min"),
      change_pct_min:  num("f-chg-min"),
      sort_by:         document.getElementById("f-sort-by").value,
      sort_desc:       document.getElementById("f-sort-desc").checked,
    };
  }

  async function run() {
    const btn     = document.getElementById("screener-run-btn");
    const resultsEl = document.getElementById("screener-results");
    btn.disabled  = true;
    btn.textContent = "Lädt…";
    resultsEl.innerHTML = "<p class='dim center loading'>Screener läuft</p>";

    try {
      const body = buildRequestBody();
      const resp = await fetch(`${API}/screener`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await resp.json();
      lastResults = data.results || [];
      sortCol  = body.sort_by;
      sortDesc = body.sort_desc;
      render(lastResults);
    } catch(e) {
      resultsEl.innerHTML = `<p class="dim center">Fehler: ${e.message}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Screener starten";
    }
  }

  function render(rows) {
    const el = document.getElementById("screener-results");
    if (!rows.length) {
      el.innerHTML = "<p class='dim center'>Keine Treffer für die gewählten Filter.</p>";
      return;
    }

    const cols   = Object.keys(COL_MAP);
    const header = cols.map(col => {
      const isActive = col === sortCol;
      const arrow    = isActive ? (sortDesc ? " ▼" : " ▲") : "";
      return `<th class="${isActive ? "sort-active" : ""}" data-col="${col}">${COL_MAP[col].label}${arrow}</th>`;
    }).join("");

    const body = rows.map(row => {
      const cells = cols.map(col => {
        const def     = COL_MAP[col];
        const rawVal  = row[col];
        const display = def.fmt(rawVal);
        const colorC  = def.colorFn ? def.colorFn(rawVal) : "";
        const cls     = [def.cls, colorC].filter(Boolean).join(" ");
        if (col === "ticker") {
          return `<td class="${cls}" onclick="selectTicker('${row.ticker}')">${display}</td>`;
        }
        return `<td class="${cls}">${display}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    el.innerHTML = `
      <table class="screener-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;

    // Spaltenklick → Sortierung
    el.querySelectorAll("th[data-col]").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (col === sortCol) sortDesc = !sortDesc;
        else { sortCol = col; sortDesc = true; }

        lastResults.sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return sortDesc ? bv - av : av - bv;
        });
        render(lastResults);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("screener-run-btn").addEventListener("click", run);
  });

  return {};
})();
