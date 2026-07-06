/**
 * app.js – Globaler State, Navigation, Ticker-Auswahl, Polling
 */

const API = "/api";

// ── Globaler State ──
const State = {
  activeTicker: null,
  activeRange:  "1D",
  activeView:   "chart",
  activeInds:   new Set(["volume"]),
  pollTimer:    null,
  chartTimer:   null,
};

// ── Hilfsfunktionen ──
function fmt(val, decimals = 2) {
  if (val == null || isNaN(val)) return "–";
  return Number(val).toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtBig(val) {
  if (val == null || isNaN(val)) return "–";
  if (Math.abs(val) >= 1e12) return (val / 1e12).toFixed(2) + " Bio.";
  if (Math.abs(val) >= 1e9)  return (val / 1e9).toFixed(2)  + " Mrd.";
  if (Math.abs(val) >= 1e6)  return (val / 1e6).toFixed(2)  + " Mio.";
  return val.toLocaleString("de-DE");
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return "–";
  return (val * 100).toFixed(2) + "%";
}

function changeClass(pct) {
  if (pct > 0) return "change-up";
  if (pct < 0) return "change-down";
  return "change-neutral";
}

async function apiFetch(path) {
  const resp = await fetch(API + path);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Ticker aktivieren ──
async function selectTicker(ticker) {
  State.activeTicker = ticker;

  // Watchlist-Highlight
  document.querySelectorAll(".wl-item").forEach(el => {
    el.classList.toggle("active", el.dataset.ticker === ticker);
  });

  updateTopbar(ticker);
  loadCurrentView();
  if (State.activeView === "insider") InsiderModule.load(ticker);
  NewsModule.load(ticker);
}

async function updateTopbar(ticker) {
  const sym  = document.getElementById("ticker-symbol");
  const nm   = document.getElementById("ticker-name");
  const pr   = document.getElementById("ticker-price");
  const ch   = document.getElementById("ticker-change");
  const vol  = document.getElementById("ticker-volume");
  const upd  = document.getElementById("last-updated");

  sym.textContent = ticker;
  nm.textContent  = "Lädt…";

  try {
    const q = await apiFetch(`/quote/${ticker}`);
    nm.textContent  = ticker;
    pr.textContent  = "$" + fmt(q.price);
    ch.textContent  = (q.change_pct >= 0 ? "+" : "") + fmt(q.change_pct) + "%";
    ch.className    = changeClass(q.change_pct);
    vol.textContent = q.volume ? "Vol: " + fmtBig(q.volume) : "";
    upd.textContent = q.updated_at ? "Stand: " + new Date(q.updated_at).toLocaleTimeString("de-DE") : "";
  } catch(e) {
    nm.textContent = "Fehler beim Laden";
  }
}

// ── View-Switching ──
function loadCurrentView() {
  if (!State.activeTicker) return;
  if (State.activeView === "chart")        ChartModule.load(State.activeTicker, State.activeRange);
  if (State.activeView === "fundamentals") FundModule.load(State.activeTicker);
}

function switchView(view) {
  if (State.activeView === "browse"   && view !== "browse")   BrowseModule.deactivate();
  if (State.activeView === "heatmap"  && view !== "heatmap")  HeatmapModule.deactivate();
  State.activeView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "browse")  { BrowseModule.activate();  return; }
  if (view === "heatmap") { HeatmapModule.activate();  return; }
  if (view === "insider" && State.activeTicker) { InsiderModule.load(State.activeTicker); return; }
  loadCurrentView();
}

// ── Polling ──
// Kurs-Poll (15s): Topbar + Watchlist-Preise
// Chart-Poll: Intraday-Ranges (1m-30m) alle 30s, sonst 60s
const INTRADAY_RANGES = new Set(["1m","2m","5m","15m","30m"]);

function startPolling() {
  stopPolling();
  State.pollTimer = setInterval(() => {
    if (State.activeTicker) updateTopbar(State.activeTicker);
    WatchlistModule.refreshQuotes();
  }, 15000);

  State.chartTimer = setInterval(() => {
    if (State.activeTicker && State.activeView === "chart") {
      ChartModule.load(State.activeTicker, State.activeRange);
    }
  }, INTRADAY_RANGES.has(State.activeRange) ? 30000 : 60000);
}

function stopPolling() {
  if (State.pollTimer)  clearInterval(State.pollTimer);
  if (State.chartTimer) clearInterval(State.chartTimer);
}

// ── Event-Listener ──
document.addEventListener("DOMContentLoaded", () => {
  // Nav-Buttons
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Zeitrahmen-Buttons
  document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeRange = btn.dataset.range;
      if (State.activeTicker) ChartModule.load(State.activeTicker, State.activeRange);
      // Chart-Poll-Intervall an neuen Timeframe anpassen
      startPolling();
    });
  });

  // Indikator-Buttons
  document.querySelectorAll(".ind-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const ind = btn.dataset.ind;
      if (State.activeInds.has(ind)) {
        State.activeInds.delete(ind);
        btn.classList.remove("active");
      } else {
        State.activeInds.add(ind);
        btn.classList.add("active");
      }
      if (State.activeTicker) ChartModule.load(State.activeTicker, State.activeRange);
    });
  });

  // Refresh-Button
  document.getElementById("refresh-btn").addEventListener("click", () => {
    if (State.activeTicker) {
      updateTopbar(State.activeTicker);
      loadCurrentView();
    }
    WatchlistModule.refreshQuotes();
  });

  // Ticker-Suche
  SearchModule.init();

  // Watchlist laden
  WatchlistModule.init();

  // Browse-Modul initialisieren
  BrowseModule.init();

  // Heatmap-Modul initialisieren
  HeatmapModule.init();

  // ── Mobile Suche ──
  const mobileSearchBtn     = document.getElementById("mobile-search-btn");
  const mobileSearchOverlay = document.getElementById("mobile-search-overlay");
  const mobileSearchInput   = document.getElementById("mobile-search-input");
  const mobileSearchClose   = document.getElementById("mobile-search-close");
  const mobileResultsList   = document.getElementById("mobile-search-results");

  function openMobileSearch() {
    mobileSearchOverlay.classList.remove("hidden");
    mobileSearchInput.value = "";
    mobileResultsList.innerHTML = "";
    mobileResultsList.classList.add("hidden");
    setTimeout(() => mobileSearchInput.focus(), 80);
  }
  function closeMobileSearch() {
    mobileSearchOverlay.classList.add("hidden");
    mobileSearchInput.value = "";
    mobileResultsList.classList.add("hidden");
  }

  mobileSearchBtn.addEventListener("click", openMobileSearch);
  mobileSearchClose.addEventListener("click", closeMobileSearch);

  // Chart-Placeholder CTA
  const chartCTA = document.getElementById("chart-search-cta");
  if (chartCTA) chartCTA.addEventListener("click", openMobileSearch);

  let mobileSearchTimer = null;
  mobileSearchInput.addEventListener("input", () => {
    clearTimeout(mobileSearchTimer);
    const q = mobileSearchInput.value.trim();
    if (q.length < 1) { mobileResultsList.classList.add("hidden"); return; }
    mobileSearchTimer = setTimeout(async () => {
      try {
        const results = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
        const items   = results.results || results || [];
        if (!items.length) { mobileResultsList.classList.add("hidden"); return; }
        mobileResultsList.innerHTML = items.slice(0, 8).map(r =>
          `<li data-ticker="${r.ticker}">
            <span class="sr-ticker">${r.ticker}</span>
            <span class="sr-name">${r.name || ""}</span>
          </li>`
        ).join("");
        mobileResultsList.classList.remove("hidden");
        mobileResultsList.querySelectorAll("li").forEach(li => {
          li.addEventListener("click", () => {
            selectTicker(li.dataset.ticker);
            WatchlistModule.addTicker(li.dataset.ticker);
            closeMobileSearch();
            switchView("chart");
          });
        });
      } catch(_) {}
    }, 280);
  });

  // Schließen bei Klick außerhalb
  mobileSearchOverlay.addEventListener("click", e => {
    if (e.target === mobileSearchOverlay) closeMobileSearch();
  });

  // Polling starten
  startPolling();
});
