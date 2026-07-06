/**
 * watchlist.js – Watchlist CRUD + Autocomplete-Suche
 */

const SearchModule = (() => {
  let debounceTimer = null;

  function init() {
    const input   = document.getElementById("search-input");
    const results = document.getElementById("search-results");

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 1) { results.classList.add("hidden"); return; }
      debounceTimer = setTimeout(() => doSearch(q), 280);
    });

    // Klick außerhalb schließt Dropdown
    document.addEventListener("click", e => {
      if (!e.target.closest("#search-box")) results.classList.add("hidden");
    });
  }

  async function doSearch(q) {
    const results = document.getElementById("search-results");
    results.innerHTML = "<li class='dim' style='padding:8px 12px'>Suche…</li>";
    results.classList.remove("hidden");
    try {
      const data = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
      renderResults(data);
    } catch(e) {
      results.innerHTML = "<li class='dim' style='padding:8px 12px'>Fehler bei der Suche</li>";
    }
  }

  function renderResults(items) {
    const results = document.getElementById("search-results");
    const input   = document.getElementById("search-input");

    if (!items.length) {
      results.innerHTML = "<li class='dim' style='padding:8px 12px'>Keine Treffer</li>";
      return;
    }
    results.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="sr-ticker">${item.ticker}</span><span class="sr-name">${item.name || "–"} · ${item.exchange || ""}</span>`;
      li.addEventListener("click", () => {
        WatchlistModule.add(item.ticker, item.name);
        input.value = "";
        results.classList.add("hidden");
      });
      results.appendChild(li);
    });
  }

  return { init };
})();


const WatchlistModule = (() => {
  let items = []; // { ticker, name }

  async function init() {
    try {
      items = await apiFetch("/watchlist");
    } catch(e) {
      items = [];
    }
    render();
    refreshQuotes();
  }

  function render() {
    const ul    = document.getElementById("watchlist-items");
    const count = document.getElementById("watchlist-count");
    count.textContent = items.length;
    ul.innerHTML = "";

    if (!items.length) {
      ul.innerHTML = "<li class='dim center'>Noch keine Aktien</li>";
      return;
    }

    items.forEach(it => {
      const li = document.createElement("li");
      li.className = "wl-item";
      li.dataset.ticker = it.ticker;
      if (State.activeTicker === it.ticker) li.classList.add("active");

      li.innerHTML = `
        <div class="wl-left">
          <span class="wl-ticker">${it.ticker}</span>
          <span class="wl-name">${it.name || "–"}</span>
        </div>
        <div class="wl-right">
          <div class="wl-price" id="wl-price-${it.ticker}">–</div>
          <div class="wl-change change-neutral" id="wl-change-${it.ticker}">–</div>
        </div>
        <button class="wl-remove" title="Entfernen">×</button>
      `;
      li.addEventListener("click", e => {
        if (e.target.classList.contains("wl-remove")) return;
        selectTicker(it.ticker);
      });
      li.querySelector(".wl-remove").addEventListener("click", () => remove(it.ticker));
      ul.appendChild(li);
    });
  }

  async function add(ticker, name) {
    ticker = ticker.toUpperCase();
    try {
      await fetch(`${API}/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name: name || null }),
      });
      // Neu laden
      items = await apiFetch("/watchlist");
      render();
      refreshQuotes();
      selectTicker(ticker);
    } catch(e) {
      console.error("Watchlist add error:", e);
    }
  }

  async function remove(ticker) {
    try {
      await fetch(`${API}/watchlist/${ticker}`, { method: "DELETE" });
      items = items.filter(i => i.ticker !== ticker);
      if (State.activeTicker === ticker) State.activeTicker = null;
      render();
    } catch(e) {
      console.error("Watchlist remove error:", e);
    }
  }

  async function refreshQuotes() {
    if (!items.length) return;
    const tickers = items.map(i => i.ticker).join(",");
    try {
      const quotes = await apiFetch(`/quote?tickers=${encodeURIComponent(tickers)}`);
      quotes.forEach(q => {
        const priceEl  = document.getElementById(`wl-price-${q.ticker}`);
        const changeEl = document.getElementById(`wl-change-${q.ticker}`);
        if (priceEl && q.price) {
          priceEl.textContent  = "$" + fmt(q.price);
          changeEl.textContent = (q.change_pct >= 0 ? "+" : "") + fmt(q.change_pct) + "%";
          changeEl.className   = "wl-change " + changeClass(q.change_pct);
        }
      });
    } catch(e) {
      // Fehler still ignorieren (gecachte Daten bleiben sichtbar)
    }
  }

  return { init, add, remove, refreshQuotes };
})();
