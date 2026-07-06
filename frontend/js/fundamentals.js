/**
 * fundamentals.js – Fundamentaldaten-Ansicht
 */

const FundModule = (() => {
  async function load(ticker) {
    if (State.activeView !== "fundamentals") return;

    const kpiEl = document.getElementById("fund-kpis");
    const qEl   = document.getElementById("fund-quarterly");
    const aEl   = document.getElementById("fund-annual");

    kpiEl.innerHTML = "<p class='dim loading'>Lade</p>";

    try {
      const d = await apiFetch(`/fundamentals/${ticker}`);
      renderKPIs(kpiEl, d);
      renderFinTable(qEl, d.quarterly_results, "Quartal");
      renderFinTable(aEl, d.annual_results, "Jahr");
    } catch(e) {
      kpiEl.innerHTML = `<p class='dim'>Fehler beim Laden: ${e.message}</p>`;
    }
  }

  function kpi(label, value, cls = "") {
    return `<div class="kpi-item">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value ${cls}">${value}</span>
    </div>`;
  }

  function renderKPIs(el, d) {
    const divYield = d.dividend_yield != null ? fmtPct(d.dividend_yield) : "–";
    const revGrowth = d.revenue_growth != null ? fmtPct(d.revenue_growth) : "–";
    const epsGrowth = d.earnings_growth != null ? fmtPct(d.earnings_growth) : "–";
    const roe = d.return_on_equity != null ? fmtPct(d.return_on_equity) : "–";
    const margin = d.profit_margins != null ? fmtPct(d.profit_margins) : "–";

    el.innerHTML = `
      ${kpi("KGV (trailing)", d.pe_ratio != null ? fmt(d.pe_ratio) : "–")}
      ${kpi("KGV (forward)", d.forward_pe != null ? fmt(d.forward_pe) : "–")}
      ${kpi("KUV", d.ps_ratio != null ? fmt(d.ps_ratio) : "–")}
      ${kpi("Kurs/Buchwert", d.pb_ratio != null ? fmt(d.pb_ratio) : "–")}
      ${kpi("EPS (ttm)", d.eps != null ? "$" + fmt(d.eps) : "–")}
      ${kpi("EPS (forward)", d.eps_forward != null ? "$" + fmt(d.eps_forward) : "–")}
      ${kpi("Marktkapitalisierung", fmtBig(d.market_cap))}
      ${kpi("Dividendenrendite", divYield)}
      ${kpi("Ausschüttungsquote", d.payout_ratio != null ? fmtPct(d.payout_ratio) : "–")}
      ${kpi("Umsatzwachstum", revGrowth, revGrowth !== "–" && d.revenue_growth > 0 ? "pos" : revGrowth !== "–" ? "neg" : "")}
      ${kpi("Gewinnwachstum", epsGrowth, epsGrowth !== "–" && d.earnings_growth > 0 ? "pos" : epsGrowth !== "–" ? "neg" : "")}
      ${kpi("Verschuldungsgrad", d.debt_to_equity != null ? fmt(d.debt_to_equity) : "–")}
      ${kpi("Current Ratio", d.current_ratio != null ? fmt(d.current_ratio) : "–")}
      ${kpi("Eigenkapitalrendite", roe)}
      ${kpi("Nettomarge", margin)}
      ${kpi("Free Cashflow", fmtBig(d.free_cashflow))}
      ${kpi("Sektor", d.sector || "–")}
      ${kpi("Branche", d.industry || "–")}
    `;
  }

  function renderFinTable(el, rows, periodLabel) {
    if (!rows || !rows.length) {
      el.innerHTML = "<p class='dim center'>Keine Daten verfügbar</p>";
      return;
    }
    const html = `
      <table class="fin-table">
        <thead><tr>
          <th>${periodLabel}</th>
          <th>Umsatz</th>
          <th>Nettogewinn</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.period}</td>
              <td>${fmtBig(r.revenue)}</td>
              <td class="${r.net_income >= 0 ? "change-up" : "change-down"}">${fmtBig(r.net_income)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    el.innerHTML = html;
  }

  return { load };
})();
