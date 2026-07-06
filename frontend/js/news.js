/**
 * news.js – News-Feed mit Auto-Polling (alle 3 Minuten)
 */

const NewsModule = (() => {
  let pollTimer    = null;
  let currentTicker = null;

  async function load(ticker, force = false) {
    currentTicker = ticker;
    const listEl  = document.getElementById("news-list");
    const labelEl = document.getElementById("news-ticker-label");
    labelEl.textContent = ticker;

    if (!force) listEl.innerHTML = "<p class='dim center loading'>Lade News</p>";

    try {
      const data = await apiFetch(`/news/${ticker}`);
      renderNews(listEl, data.items, data.from_cache);
    } catch(e) {
      listEl.innerHTML = "<p class='dim center'>Fehler beim Laden der News</p>";
    }

    // Polling neu starten
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (currentTicker) load(currentTicker, true);
    }, 180000); // 3 Minuten
  }

  function renderNews(el, items, fromCache) {
    if (!items || items.length === 0) {
      el.innerHTML = "<p class='dim center'>Keine News gefunden.<br><small>Finnhub API-Key in .env setzen für Live-News.</small></p>";
      return;
    }
    el.innerHTML = items.map(n => {
      const date = n.published ? new Date(n.published).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <div class="news-item">
          <div class="news-headline">
            <a href="${n.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.headline)}</a>
          </div>
          ${n.summary ? `<div class="news-summary">${escapeHtml(n.summary)}</div>` : ""}
          <div class="news-meta">
            <span>${escapeHtml(n.source || "")}</span>
            <span>${date}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // News-Refresh-Button
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("news-refresh-btn").addEventListener("click", () => {
      if (currentTicker) load(currentTicker, false);
    });
  });

  return { load };
})();
