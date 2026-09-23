(function () {
  const cfgRaw = sessionStorage.getItem("__rym_ext_sync_cfg");
  let cfg = {};
  try {
    cfg = JSON.parse(cfgRaw || "{}");
  } catch (_) {
    cfg = {};
  }

  const SOURCE = cfg.source || "rym-ext-collection-sync-v1";
  const MAX_COLLECTION_PAGES = typeof cfg.maxPages === "number" ? cfg.maxPages : 2000;
  const RYM_ORIGIN = "https://rateyourmusic.com";
  const INITIAL_BATCH_DELAY_MS =
    typeof cfg.fetchDelay === "number" ? cfg.fetchDelay : 1000;
  const INITIAL_BATCH_SIZE = 3;
  const CF_BACKOFF_MS = 5000;
  const THROTTLED_BATCH_DELAY_MS = 2000;
  const THROTTLED_BATCH_SIZE = 1;
  const MAX_CF_RETRY_ROUNDS = 24;

  function post(type, extra) {
    window.postMessage(Object.assign({ source: SOURCE, type: type }, extra || {}), "*");
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normalizeReleaseUrl(href) {
    if (!href || typeof href !== "string") return null;
    try {
      var url = new URL(href, RYM_ORIGIN);
      if (!url.hostname.endsWith("rateyourmusic.com")) return null;
      url.hash = "";
      url.search = "";

      var parts = url.pathname.split("/");
      var pathname;

      if (parts[1] === "release") {
        parts = parts.slice(0, 5);
        if (parts[3]) {
          parts[3] = parts[3].replace(/[-_]/g, "");
        }
        if (parts[4]) {
          parts[4] = parts[4]
            .replace(/(?:-[0-9]+|_[a-z]*[0-9]+)$/i, "")
            .replace(/[-_]/g, "");
        }
        pathname = parts.join("/");
      } else if (parts[1] === "film") {
        pathname = parts.slice(0, 3).join("/");
      } else {
        return null;
      }

      if (!pathname.endsWith("/")) {
        pathname += "/";
      }

      return RYM_ORIGIN + pathname;
    } catch (_) {
      return null;
    }
  }

  function formatRatingString(raw) {
    var s = String(raw || "")
      .trim()
      .replace(",", ".");
    var n = parseFloat(s, 10);
    if (isNaN(n) || n < 0 || n > 5) return null;
    var r = Math.round(n * 2) / 2;
    if (r % 1 === 0) return String(Math.round(r));
    return String(r);
  }

  function parseRatingFromContainer(container) {
    if (!container) return null;
    var pool = "";

    function add(s) {
      if (s) pool += " " + String(s);
    }

    add(container.textContent || "");
    if (container.getAttribute) {
      add(container.getAttribute("title"));
      add(container.getAttribute("aria-label"));
    }

    var cand = container.querySelectorAll(
      "[class*='rating'], img[title], img[alt], [title*='star'], td, span"
    );
    var maxCand = Math.min(cand.length, 40);
    for (var i = 0; i < maxCand; i++) {
      var el = cand[i];
      add(el.textContent || "");
      add(el.getAttribute && el.getAttribute("title"));
      add(el.getAttribute && el.getAttribute("alt"));
      add(el.getAttribute && el.getAttribute("aria-label"));
    }

    var m = pool.match(/(\d+(?:[\.,]\d+)?)\s*stars?/i);
    if (m) return formatRatingString(m[1]);
    m = pool.match(/\b([0-5](?:\.[0-9]+)?)\s*(?:\/\s*5)?\b/);
    if (m) return formatRatingString(m[1]);
    return null;
  }

  function extractUsernameFromDom() {
    var pathUser = window.location.pathname.match(/^\/collection\/([^/]+)/);
    if (!pathUser) {
      pathUser = window.location.pathname.match(/^\/film_collection\/([^/]+)/);
    }
    if (pathUser) return decodeURIComponent(pathUser[1]);

    var navSelectors = [
      "header a[href]",
      "nav a[href]",
      '[role="navigation"] a[href]',
      "#header a[href]",
      ".site_header a[href]",
      "#nav a[href]",
    ];
    for (var s = 0; s < navSelectors.length; s++) {
      var nodes = document.querySelectorAll(navSelectors[s]);
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        var href = a.getAttribute("href") || "";
        var m = href.match(/^\/~([^/?#]+)/);
        if (m) return m[1];
        m = href.match(/rateyourmusic\.com\/~([^/?#]+)/i);
        if (m) return m[1];
        m = href.match(/^\/user\/([^/?#]+)/);
        if (m) return decodeURIComponent(m[1]);
      }
    }

    var tildeLinks = document.querySelectorAll(
      'a[href^="/~"], a[href*="rateyourmusic.com/~"]'
    );
    for (var j = 0; j < tildeLinks.length; j++) {
      var a2 = tildeLinks[j];
      var href2 = a2.getAttribute("href") || "";
      var m2 = href2.match(/^\/~([^/?#]+)/);
      if (m2) return m2[1];
      m2 = href2.match(/rateyourmusic\.com\/~([^/?#]+)/i);
      if (m2) return m2[1];
    }
    return null;
  }

  function extractRatingsFromCollectionHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var content = doc.querySelector("#content") || doc.body;
    var entries = [];

    function pushEntry(href, ctx) {
      var norm = normalizeReleaseUrl(href);
      if (!norm) return;
      var rating = parseRatingFromContainer(ctx);
      entries.push({ url: norm, rating: rating || "" });
    }

    var primaryCombined =
      "a.album[href^='/release/'], a.album[href^='/film/'], " +
      "a.film[href^='/release/'], a.film[href^='/film/'], " +
      ".album[href^='/release/'], .album[href^='/film/'], " +
      ".film[href^='/release/'], .film[href^='/film/'], " +
      "a.list_film[href^='/film/'], a.list_film[href*='/film/']";

    var primaryNodes = content.querySelectorAll(primaryCombined);
    if (primaryNodes.length) {
      for (var n = 0; n < primaryNodes.length; n++) {
        var el = primaryNodes[n];
        var href = el.getAttribute("href");
        var ctx =
          el.closest("tr") ||
          el.closest("li") ||
          el.closest("[class*='catalog']") ||
          el.parentElement;
        pushEntry(href, ctx);
      }
      return { entries: entries, rowCount: primaryNodes.length };
    }

    var seenTr = new Set();
    content.querySelectorAll("table tbody tr").forEach(function (tr) {
      var link = tr.querySelector(
        "a[href^='/release/'], a[href^='/film/'], a[href^='https://rateyourmusic.com/release/'], a[href^='https://rateyourmusic.com/film/']"
      );
      if (!link || seenTr.has(tr)) return;
      seenTr.add(tr);
      pushEntry(link.getAttribute("href"), tr);
    });
    if (seenTr.size) {
      return { entries: entries, rowCount: seenTr.size };
    }

    var loose = content.querySelectorAll(
      "a[href^='/release/'], a[href^='/film/'], a[href^='https://rateyourmusic.com/release/'], a[href^='https://rateyourmusic.com/film/']"
    );
    loose.forEach(function (a) {
      var ctx = a.closest("tr") || a.closest("li") || a.parentElement;
      pushEntry(a.getAttribute("href"), ctx);
    });
    return { entries: entries, rowCount: loose.length };
  }

  function loadExistingRatings() {
    var raw = {};
    try {
      raw = JSON.parse(sessionStorage.getItem("__rym_ext_existing_ratings") || "{}");
    } catch (_) {
      raw = {};
    }

    var existingMap = {};
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var k = normalizeReleaseUrl(raw[i]) || raw[i];
        if (k) existingMap[k] = "";
      }
    } else if (raw && typeof raw === "object") {
      for (var key in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        var nk = normalizeReleaseUrl(key) || key;
        existingMap[nk] = String(raw[key] != null ? raw[key] : "");
      }
    }

    var existingSet = new Set(Object.keys(existingMap));
    return { existingMap: existingMap, existingSet: existingSet };
  }

  function uniqueNormalizedPageUrls(urls) {
    var out = [];
    var seen = new Set();
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i];
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }

  function pageFullyKnownInStorage(pageUrls, existingSet) {
    if (!pageUrls.length) return false;
    for (var i = 0; i < pageUrls.length; i++) {
      if (!existingSet.has(pageUrls[i])) return false;
    }
    return true;
  }

  function buildRatedCollectionPageUrl(baseUrlPrefix, pageNum) {
    return baseUrlPrefix + pageNum;
  }

  async function fetchCollectionPage(baseUrlPrefix, pageNum) {
    var url = buildRatedCollectionPageUrl(baseUrlPrefix, pageNum);
    var res = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    var ok = res.ok;
    var status = res.status;
    var html = "";
    if (ok) {
      html = await res.text();
    }
    return { page: pageNum, ok: ok, status: status, html: html };
  }

  async function resolveBatchWithCloudflareRetry(
    pages,
    baseUrlPrefix,
    syncState,
    progressLabel
  ) {
    var byPage = new Map();
    var cfRounds = 0;
    var prefix = "Syncing " + progressLabel + ": ";

    function mergeResults(results) {
      for (var i = 0; i < results.length; i++) {
        byPage.set(results[i].page, results[i]);
      }
    }

    var first = await Promise.all(
      pages.map(function (p) {
        return fetchCollectionPage(baseUrlPrefix, p);
      })
    );
    mergeResults(first);

    while (true) {
      var cfPages = [];
      for (var j = 0; j < pages.length; j++) {
        var pg = pages[j];
        var entry = byPage.get(pg);
        if (entry && !entry.ok && (entry.status === 403 || entry.status === 429)) {
          cfPages.push(pg);
        }
      }
      if (!cfPages.length) break;

      cfRounds += 1;
      if (cfRounds > MAX_CF_RETRY_ROUNDS) {
        break;
      }

      syncState.batchSize = THROTTLED_BATCH_SIZE;
      syncState.delayBetweenBatches = THROTTLED_BATCH_DELAY_MS;

      post("progress", {
        message:
          prefix +
          "HTTP " +
          byPage.get(cfPages[0]).status +
          " on page " +
          cfPages.join(", ") +
          "; pausing 5s, switching to 1 page per batch and " +
          THROTTLED_BATCH_DELAY_MS +
          "ms delay, then retrying…",
      });

      await sleep(CF_BACKOFF_MS);

      var retried = [];
      for (var t = 0; t < cfPages.length; t++) {
        retried.push(await fetchCollectionPage(baseUrlPrefix, cfPages[t]));
      }
      mergeResults(retried);
    }

    var ordered = [];
    for (var k = 0; k < pages.length; k++) {
      ordered.push(byPage.get(pages[k]));
    }
    return ordered;
  }

  function buildRatedCollectionBasePrefix(pathSegment, username) {
    return (
      RYM_ORIGIN +
      "/" +
      pathSegment +
      "/" +
      encodeURIComponent(username) +
      "/r0.5-5.0,ss.dd/"
    );
  }

  async function syncRatedCollectionSection(options) {
    var baseUrlPrefix = options.baseUrlPrefix;
    var progressLabel = options.progressLabel;
    var existingSet = options.existingSet;
    var collectedRatings = options.collectedRatings;
    var syncState = options.syncState;
    var prefix = "Syncing " + progressLabel + ": ";

    var nextPage = 1;

    while (true) {
      if (nextPage > MAX_COLLECTION_PAGES) {
        post("progress", {
          message:
            prefix +
            "stopped after " +
            MAX_COLLECTION_PAGES +
            " pages (safety limit).",
        });
        break;
      }

      var pagesInBatch = [];
      for (var bi = 0; bi < syncState.batchSize; bi++) {
        var pn = nextPage + bi;
        if (pn > MAX_COLLECTION_PAGES) break;
        pagesInBatch.push(pn);
      }
      if (!pagesInBatch.length) break;

      var batchLabel =
        pagesInBatch.length === 1
          ? "page " + pagesInBatch[0]
          : "pages " + pagesInBatch[0] + "–" + pagesInBatch[pagesInBatch.length - 1];

      post("progress", {
        message:
          prefix +
          "next batch (" +
          batchLabel +
          ", size " +
          syncState.batchSize +
          "); waiting " +
          syncState.delayBetweenBatches +
          "ms…",
      });
      await sleep(syncState.delayBetweenBatches);

      post("progress", {
        message: prefix + "fetching batch " + pagesInBatch.join(", ") + "…",
      });

      var batchResults = await resolveBatchWithCloudflareRetry(
        pagesInBatch,
        baseUrlPrefix,
        syncState,
        progressLabel
      );

      var fatal = null;
      for (var fi = 0; fi < batchResults.length; fi++) {
        if (!batchResults[fi].ok) {
          fatal = batchResults[fi];
          break;
        }
      }
      if (fatal) {
        post("error", {
          message:
            prefix +
            "HTTP " +
            fatal.status +
            " for page " +
            fatal.page,
        });
        return false;
      }

      var stopSection = false;
      for (var ri = 0; ri < batchResults.length; ri++) {
        var br = batchResults[ri];
        var pageNum = br.page;
        var html = br.html;
        var parsed = extractRatingsFromCollectionHtml(html);
        var entries = parsed.entries;
        var rowCount = parsed.rowCount;

        if (rowCount === 0) {
          post("progress", {
            message: prefix + "page " + pageNum + " has no rows; finishing this collection.",
          });
          stopSection = true;
          break;
        }

        var urls = [];
        for (var ui = 0; ui < entries.length; ui++) {
          urls.push(entries[ui].url);
        }
        var pageUnique = uniqueNormalizedPageUrls(urls);
        if (pageFullyKnownInStorage(pageUnique, existingSet)) {
          post("progress", {
            message:
              prefix +
              "page " +
              pageNum +
              ": all " +
              pageUnique.length +
              " items already in storage; stopping incremental sync for this collection.",
          });
          stopSection = true;
          break;
        }

        for (var ei = 0; ei < entries.length; ei++) {
          var ent = entries[ei];
          collectedRatings[ent.url] = ent.rating || "";
        }

        var collectedCount = 0;
        for (var ck in collectedRatings) {
          if (Object.prototype.hasOwnProperty.call(collectedRatings, ck)) collectedCount++;
        }

        post("progress", {
          message:
            prefix +
            "processed page " +
            pageNum +
            " (" +
            entries.length +
            " items on page, " +
            collectedCount +
            " titles collected this run so far).",
        });
      }

      if (stopSection) break;

      nextPage = pagesInBatch[pagesInBatch.length - 1] + 1;
    }

    return true;
  }

  async function run() {
    try {
      var loaded = loadExistingRatings();
      var existingMap = loaded.existingMap;
      var existingSet = loaded.existingSet;

      var username = extractUsernameFromDom();
      if (!username || !String(username).trim()) {
        post("error", { message: "Could not detect username on this page." });
        return;
      }
      username = String(username).trim();

      post("progress", {
        message:
          "User: " +
          username +
          ". Starting dual sync (" +
          existingSet.size +
          " URLs already in storage). Music first, then Films.",
      });

      var collectedRatings = {};
      var syncState = {
        batchSize: INITIAL_BATCH_SIZE,
        delayBetweenBatches: INITIAL_BATCH_DELAY_MS,
      };

      var musicBase = buildRatedCollectionBasePrefix("collection", username);
      var musicOk = await syncRatedCollectionSection({
        baseUrlPrefix: musicBase,
        progressLabel: "Music",
        existingSet: existingSet,
        collectedRatings: collectedRatings,
        syncState: syncState,
      });
      if (!musicOk) return;

      Object.keys(collectedRatings).forEach(function (k) {
        existingSet.add(k);
      });

      post("progress", {
        message: "Music sync finished. Starting Films (film_collection)…",
      });

      var filmBase = buildRatedCollectionBasePrefix("film_collection", username);
      var filmOk = await syncRatedCollectionSection({
        baseUrlPrefix: filmBase,
        progressLabel: "Films",
        existingSet: existingSet,
        collectedRatings: collectedRatings,
        syncState: syncState,
      });
      if (!filmOk) return;

      var merged = {};
      for (var ek in existingMap) {
        if (Object.prototype.hasOwnProperty.call(existingMap, ek)) {
          merged[ek] = existingMap[ek];
        }
      }
      for (var ck in collectedRatings) {
        if (Object.prototype.hasOwnProperty.call(collectedRatings, ck)) {
          merged[ck] = collectedRatings[ck];
        }
      }

      var mergedCount = 0;
      for (var mk in merged) {
        if (Object.prototype.hasOwnProperty.call(merged, mk)) mergedCount++;
      }
      var collectedRun = 0;
      for (var rk in collectedRatings) {
        if (Object.prototype.hasOwnProperty.call(collectedRatings, rk)) collectedRun++;
      }

      post("done", {
        ratings: merged,
        message:
          "Done. Merged Music + Films to " +
          mergedCount +
          " titles (" +
          collectedRun +
          " collected this run).",
      });
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      post("error", { message: "Error: " + msg });
    } finally {
      try {
        sessionStorage.removeItem("__rym_ext_sync_cfg");
        sessionStorage.removeItem("__rym_ext_existing_ratings");
      } catch (_) {}
    }
  }

  void run();
})();
