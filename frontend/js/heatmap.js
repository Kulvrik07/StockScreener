/**
 * heatmap.js – Sektor-Heatmap (SPDR Sector ETFs).
 * Kachelgröße = Sektorgewichtung. Farbe = Tagesperformance.
 */

const HeatmapModule = (() => {
  let data       = [];
  let activePeriod = "1d";
  let refreshTimer = null;
  const REFRESH  = 5 * 60 * 1000;

  // Farbe: rot (-3%) ... grau (0%) ... grün (+3%)
  function pctColor(pct) {
    if (pct == null) return "#1e222d";
    const max = 3;
    const t   = Math.max(-1, Math.min(1, pct / max));
    if (t >= 0) {
      // 0 → #263238, +1 → #26a69a
      const r = Math.round(38  + t * (38  - 38));
      const g = Math.round(50  + t * (166 - 50));
      const b = Math.round(56  + t * (154 - 56));
      return `rgb(${r},${g},${b})`;
    } else {
      // 0 → #263238, -1 → #ef5350
      const tt = -t;
      const r = Math.round(38  + tt * (239 - 38));
      const g = Math.round(50  + tt * (83  - 50));
      const b = Math.round(56  + tt * (80  - 56));
      return `rgb(${r},${g},${b})`;
    }
  }

  function render() {
    const grid = document.getElementById("heatmap-grid");
    if (!data.length) { grid.innerHTML = "<p class='dim center'>Keine Daten</p>"; return; }

    const totalWeight = data.reduce((s, d) => s + (d.weight || 1), 0);

    grid.innerHTML = data.map(sector => {
      const pct   = activePeriod === "1d" ? sector.change_pct : sector.change_1w;
      const bg    = pctColor(pct);
      const fmtP  = pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : "–";
      const fmtPr = sector.price != null ? "$" + sector.price.toFixed(2) : "–";
      const pct100 = Math.round((sector.weight || 1) / totalWeight * 100);
      const textCls = pct != null && Math.abs(pct) > 1 ? "hm-pct-bold" : "";
      return `
        <div class="heatmap-tile" style="flex-basis:${pct100}%; background:${bg}"
             data-ticker="${sector.ticker}" title="${sector.ticker}: ${fmtPr}">
          <div class="hm-sector">${sector.sector}</div>
          <div class="hm-ticker">${sector.ticker}</div>
          <div class="hm-pct ${textCls}">${fmtP}</div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".heatmap-tile").forEach(tile => {
      tile.addEventListener("click", () => {
        selectTicker(tile.dataset.ticker);
        switchView("chart");
      });
    });
  }

  async function refresh() {
    document.getElementById("heatmap-grid").innerHTML = "<p class='dim center loading'>Lade Sektordaten</p>";
    try {
      const resp = await apiFetch("/heatmap");
      data = resp.data || [];
      render();
    } catch(e) {
      document.getElementById("heatmap-grid").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  function init() {
    document.getElementById("heatmap-refresh-btn").addEventListener("click", refresh);
    document.querySelectorAll(".hmap-range-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".hmap-range-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activePeriod = btn.dataset.period;
        render();
      });
    });
  }

  function activate() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (!data.length) refresh();
    else render();
    refreshTimer = setInterval(refresh, REFRESH);
  }

  function deactivate() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  return { init, activate, deactivate };
})();
