/**
 * browse.js – Markt-Übersicht (Indizes, Mega-Caps, Sektoren, …)
 */

const BrowseModule = (() => {
  let data       = {};     // { groupName: [{ticker, name, price, change_pct, …}] }
  let activeGroup = null;
  let refreshTimer = null;

  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

  function fmt(n, dec = 2) {
    if (n == null || isNaN(n)) return "–";
    return n.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtVol(v) {
    if (v == null) return "–";
    if (v >= 1e9) return (v / 1e9).toFixed(1) + " Mrd";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + " Mio";
    return v.toLocaleString("de-DE");
  }

  function renderTabs(groups) {
    const el = document.getElementById("browse-group-tabs");
    el.innerHTML = groups.map(g =>
      `<button class="browse-tab${g === activeGroup ? " active" : ""}" data-group="${g}">${g}</button>`
    ).join("");
    el.querySelectorAll(".browse-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        activeGroup = btn.dataset.group;
        renderTabs(groups);
        renderTable();
      });
    });
  }

  function renderTable() {
    const content = document.getElementById("browse-content");
    const rows    = data[activeGroup] || [];
    if (!rows.length) { content.innerHTML = "<p class='dim center'>Keine Daten</p>"; return; }

    const html = `
      <table class="browse-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Name</th>
            <th class="num">Kurs</th>
            <th class="num">Änderung %</th>
            <th class="num">Volumen</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const pct   = r.change_pct;
            const sign  = pct >= 0 ? "+" : "";
            const cls   = pct >= 0 ? "pos" : "neg";
            return `
              <tr class="browse-row" data-ticker="${r.ticker}">
                <td class="ticker-cell">${r.ticker}</td>
                <td class="name-cell">${r.name || r.ticker}</td>
                <td class="num">${fmt(r.price)} <small>${r.currency || ""}</small></td>
                <td class="num ${cls}">${sign}${fmt(pct)} %</td>
                <td class="num">${fmtVol(r.volume)}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    content.innerHTML = html;

    content.querySelectorAll(".browse-row").forEach(row => {
      row.addEventListener("click", () => {
        const t = row.dataset.ticker;
        selectTicker(t);
        switchView("chart");
      });
    });
  }

  async function refresh() {
    document.getElementById("browse-content").innerHTML = "<p class='dim center'>Lade Marktdaten…</p>";
    try {
      const resp = await apiFetch("/browse");
      data = resp.data || resp;
      const groups = Object.keys(data);
      if (!activeGroup || !groups.includes(activeGroup)) activeGroup = groups[0];
      renderTabs(groups);
      renderTable();
    } catch(e) {
      document.getElementById("browse-content").innerHTML = `<p class='dim center'>Fehler: ${e.message}</p>`;
    }
  }

  function init() {
    document.getElementById("browse-refresh-btn").addEventListener("click", refresh);
  }

  function activate() {
    if (refreshTimer) clearInterval(refreshTimer);
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
  }

  function deactivate() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  return { init, activate, deactivate };
})();
