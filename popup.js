const STORAGE_KEY = "ratedReleaseUrls";
const STORAGE_SHOW_LIST_RATINGS_KEY = "rymShowListRatings";
const RYM_SYNC_SOURCE = "rym-ext-collection-sync-v1";
const FETCH_DELAY_MS = 1000;
const MAX_COLLECTION_PAGES = 2000;

const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("sync");
const forceSyncBtn = document.getElementById("forceSyncBtn");
const progressContainer = document.getElementById("progressContainer");
const showListRatingsEl = document.getElementById("showListRatings");

function setAppVersion() {
  const appVersionEl = document.getElementById("app-version");
  if (appVersionEl) {
    appVersionEl.textContent = chrome.runtime.getManifest().version;
  }
}

document.addEventListener("DOMContentLoaded", setAppVersion);
if (document.readyState !== "loading") {
  setAppVersion();
}

chrome.storage.local.get([STORAGE_SHOW_LIST_RATINGS_KEY], (data) => {
  showListRatingsEl.checked = data[STORAGE_SHOW_LIST_RATINGS_KEY] !== false;
});

showListRatingsEl.addEventListener("change", () => {
  void chrome.storage.local.set({
    [STORAGE_SHOW_LIST_RATINGS_KEY]: showListRatingsEl.checked,
  });
});

function setSyncButtonsDisabled(disabled) {
  syncBtn.disabled = disabled;
  forceSyncBtn.disabled = disabled;
}

function setProgressActive(active) {
  progressContainer.style.display = active ? "block" : "none";
  progressContainer.setAttribute("aria-hidden", active ? "false" : "true");
  progressContainer.setAttribute("aria-busy", active ? "true" : "false");
}

function setStatus(message, tone) {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-success");
  if (tone === "error") statusEl.classList.add("is-error");
  else if (tone === "success") statusEl.classList.add("is-success");
}

function prepareRymCollectionSyncBridge(source, storageKey, fetchDelay, maxPages, existingRatings) {
  sessionStorage.setItem(
    "__rym_ext_sync_cfg",
    JSON.stringify({ source, fetchDelay, maxPages })
  );
  let map = {};
  if (existingRatings && typeof existingRatings === "object" && !Array.isArray(existingRatings)) {
    map = existingRatings;
  } else if (Array.isArray(existingRatings)) {
    existingRatings.forEach((u) => {
      if (typeof u === "string") map[u] = "";
    });
  }
  sessionStorage.setItem("__rym_ext_existing_ratings", JSON.stringify(map));

  const guardKey = "__rymCollectionSyncRelay_" + source;
  if (window[guardKey]) return;
  window[guardKey] = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== source) return;

    const send = (payload) => {
      void chrome.runtime.sendMessage(payload).catch(() => {});
    };

    if (d.type === "progress") {
      const message = String(d.message || "");
      chrome.storage.local.set({ rymSyncLive: { message, at: Date.now() } });
      send({ type: "rymSyncProgress", message });
    } else if (d.type === "done") {
      const message = String(d.message || "Done.");
      let payload = {};
      if (d.ratings != null && typeof d.ratings === "object" && !Array.isArray(d.ratings)) {
        payload = d.ratings;
      } else if (Array.isArray(d.urls)) {
        d.urls.forEach((u) => {
          if (typeof u === "string") payload[u] = "";
        });
      }
      chrome.storage.local.set({
        [storageKey]: payload,
        rymSyncLive: { message, done: true, at: Date.now() },
      });
      send({ type: "rymSyncProgress", message, done: true });
    } else if (d.type === "error") {
      const message = String(d.message || "Unknown error.");
      chrome.storage.local.set({ rymSyncLive: { message, error: true, at: Date.now() } });
      send({ type: "rymSyncProgress", message, error: true });
    }
  });
}

async function getActiveRymTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;
  let hostname = "";
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return null;
  }
  if (!hostname.endsWith("rateyourmusic.com")) return null;
  return tab;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "rymSyncProgress") return;
  setStatus(
    String(msg.message || ""),
    msg.error ? "error" : msg.done ? "success" : undefined
  );
  if (msg.done || msg.error) {
    setSyncButtonsDisabled(false);
    setProgressActive(false);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.rymSyncLive) return;
  const live = changes.rymSyncLive.newValue;
  if (!live || typeof live.message !== "string") return;
  setStatus(live.message, live.error ? "error" : live.done ? "success" : undefined);
  if (live.done || live.error) {
    setSyncButtonsDisabled(false);
    setProgressActive(false);
  }
});

chrome.storage.local.get(["rymSyncLive"], (data) => {
  const live = data.rymSyncLive;
  if (live && typeof live.message === "string") {
    setStatus(live.message, live.error ? "error" : live.done ? "success" : undefined);
    if (!live.done && !live.error) {
      setSyncButtonsDisabled(true);
      setProgressActive(true);
    }
  }
});

async function runCollectionSync(forceFull) {
  setSyncButtonsDisabled(true);
  setProgressActive(true);

  if (forceFull) {
    setStatus("Clearing database...");
    const preserved = await chrome.storage.local.get(STORAGE_SHOW_LIST_RATINGS_KEY);
    await chrome.storage.local.clear();
    if (preserved[STORAGE_SHOW_LIST_RATINGS_KEY] !== undefined) {
      await chrome.storage.local.set({
        [STORAGE_SHOW_LIST_RATINGS_KEY]: preserved[STORAGE_SHOW_LIST_RATINGS_KEY],
      });
    }
  } else {
    setStatus("Preparing sync in the active tab…");
    await chrome.storage.local.remove("rymSyncLive");
  }

  const tab = await getActiveRymTab();
  if (!tab) {
    setStatus("Open a rateyourmusic.com tab and try again.", "error");
    setSyncButtonsDisabled(false);
    setProgressActive(false);
    return;
  }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const rawDb = stored[STORAGE_KEY];
    let existingRatings = {};
    if (Array.isArray(rawDb)) {
      rawDb.forEach((u) => {
        if (typeof u === "string") existingRatings[u] = "";
      });
    } else if (rawDb && typeof rawDb === "object") {
      existingRatings = rawDb;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: prepareRymCollectionSyncBridge,
      args: [RYM_SYNC_SOURCE, STORAGE_KEY, FETCH_DELAY_MS, MAX_COLLECTION_PAGES, existingRatings],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["page-context-sync.js"],
    });

    setStatus("Sync started in the RYM tab. Waiting for updates…");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus("Error: " + msg, "error");
    setSyncButtonsDisabled(false);
    setProgressActive(false);
  }
}

syncBtn.addEventListener("click", () => {
  void runCollectionSync(false);
});

forceSyncBtn.addEventListener("click", () => {
  void runCollectionSync(true);
});
