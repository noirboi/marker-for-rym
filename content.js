const STORAGE_KEY = "ratedReleaseUrls";
const STORAGE_SHOW_LIST_RATINGS_KEY = "rymShowListRatings";
const RYM_ORIGIN = "https://rateyourmusic.com";
const HIGHLIGHT_CLASS = "rym-rated-highlight";
const HIGHLIGHT_STYLE_ID = "rym-extension-rated-highlight-style-v4";
const BADGE_CLASS = "rym-rating-badge";
const BADGE_STYLE_ID = "rym-extension-rating-badge-style";

const HIGHLIGHT_LIST_CLASS_RE =
  /\b(album|film|chart|list|catalog|discography)\b/i;
const HIGHLIGHT_MAX_LINKS_FOR_CLASS_MATCH = 8;
const HIGHLIGHT_ROWISH_MAX_HEIGHT_PX = 200;

const RYM_LIST_LINK_SELECTOR = [
  "a[href^='/release/']",
  "a[href^='/film/']",
  "a[href^='//rateyourmusic.com/release/']",
  "a[href^='//rateyourmusic.com/film/']",
  "a[href^='https://rateyourmusic.com/release/']",
  "a[href^='https://rateyourmusic.com/film/']",
  "a[href^='https://www.rateyourmusic.com/release/']",
  "a[href^='https://www.rateyourmusic.com/film/']",
  "a.list_film[href^='/film/']",
  "td.list_art a[href^='/film/']",
  "td.list_art a[href^='/release/']",
  "td.main_entry a[href^='/film/']",
  "td.main_entry a[href^='/release/']",
].join(", ");

let ratingsMap = {};
let showListRatings = true;
let observer = null;
let debounceTimer = null;

function injectHighlightStyles() {
  [
    "rym-extension-rated-highlight-style",
    "rym-extension-rated-highlight-style-v2",
    "rym-extension-rated-highlight-style-v3",
  ].forEach((id) => {
    const old = document.getElementById(id);
    if (old) old.remove();
  });
  document.documentElement.classList.remove("rym-ext-hl-artist-discog");
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
.${HIGHLIGHT_CLASS} {
  background-color: rgba(46, 204, 113, 0.15) !important;
  border-radius: 4px;
}
tr.${HIGHLIGHT_CLASS} {
  background-color: transparent !important;
}
tr.${HIGHLIGHT_CLASS} > td,
tr.${HIGHLIGHT_CLASS} > th {
  background-color: rgba(46, 204, 113, 0.15) !important;
}
`.trim();
  (document.head || document.documentElement).appendChild(style);
}

function injectBadgeStyles() {
  const oldBadgeStyle = document.getElementById("rym-extension-rating-badge-style-v2");
  if (oldBadgeStyle) oldBadgeStyle.remove();
  if (document.getElementById(BADGE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = BADGE_STYLE_ID;
  style.textContent = `
.${BADGE_CLASS} {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: bold;
  line-height: 1.35;
  vertical-align: middle;
  border-style: solid;
  border-width: 1px;
  border-radius: 4px;
  white-space: nowrap;
}

/* 4.5 - 5.0: Solid Cyan with very dark cyan/black text */
.badge-tier-5 {
  background-color: #22d3ee;
  color: #082f49;
  border-color: #22d3ee;
}

/* 3.5 - 4.0: Solid Green with very dark green/black text */
.badge-tier-4 {
  background-color: #4ade80;
  color: #064e3b;
  border-color: #4ade80;
}

/* 2.5 - 3.0: Solid Slate Gray with white text */
.badge-tier-3 {
  background-color: #64748b;
  color: #ffffff;
  border-color: #64748b;
}

/* 1.5 - 2.0: Solid Orange with white text */
.badge-tier-2 {
  background-color: #ea580c;
  color: #ffffff;
  border-color: #ea580c;
}

/* 0.5 - 1.0: Solid Burgundy with white text */
.badge-tier-1 {
  background-color: #9f1239;
  color: #ffffff;
  border-color: #9f1239;
}
`.trim();
  (document.head || document.documentElement).appendChild(style);
}

function normalizeReleaseUrl(href) {
  if (!href || typeof href !== "string") return null;
  try {
    const url = new URL(href, RYM_ORIGIN);
    if (!url.hostname.endsWith("rateyourmusic.com")) return null;
    url.hash = "";
    url.search = "";

    let parts = url.pathname.split("/");
    let pathname;

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
  } catch {
    return null;
  }
}

function migrateRawToRatingsMap(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((u) => {
      if (typeof u !== "string") return;
      const k = normalizeReleaseUrl(u) || u;
      if (k) out[k] = "";
    });
    return out;
  }
  if (typeof raw === "object") {
    const out = {};
    Object.keys(raw).forEach((key) => {
      const nk = normalizeReleaseUrl(key) || key;
      out[nk] = String(raw[key] != null ? raw[key] : "");
    });
    return out;
  }
  return {};
}

function hasRatedKey(map, normalizedUrl) {
  if (!normalizedUrl || !map) return false;
  if (Object.prototype.hasOwnProperty.call(map, normalizedUrl)) return true;
  const alt = normalizedUrl.endsWith("/")
    ? normalizedUrl.slice(0, -1)
    : normalizedUrl + "/";
  return Object.prototype.hasOwnProperty.call(map, alt);
}

function getRatingForUrl(map, normalizedUrl) {
  if (!map || !normalizedUrl) return "";
  if (Object.prototype.hasOwnProperty.call(map, normalizedUrl)) {
    return map[normalizedUrl];
  }
  const alt = normalizedUrl.endsWith("/")
    ? normalizedUrl.slice(0, -1)
    : normalizedUrl + "/";
  return Object.prototype.hasOwnProperty.call(map, alt) ? map[alt] : "";
}

function collectAncestorTableRows(el) {
  const rows = [];
  let node = el;
  while (node && node !== document.body) {
    if (node.tagName === "TR") rows.push(node);
    node = node.parentElement;
  }
  return rows;
}

function isTableRowInsideNestedListTable(tr) {
  const table = tr.closest("table");
  if (!table) return false;
  const parent = table.parentElement;
  return !!(parent && (parent.tagName === "TD" || parent.tagName === "TH"));
}

function directListArtCell(tr) {
  return tr.querySelector(":scope > td.list_art, :scope > th.list_art");
}

function directMainEntryCell(tr) {
  return tr.querySelector(":scope > td.main_entry, :scope > th.main_entry");
}

function isRymSearchResultsShellRow(tr) {
  const nestedInfobox = tr.querySelectorAll("tr.infobox").length;
  if (nestedInfobox >= 2) return true;
  if (nestedInfobox !== 1) return false;
  const topTd = tr.querySelector(":scope > td");
  if (!topTd) return false;
  return (
    topTd.querySelector("h3") != null && topTd.querySelector("tr.infobox") != null
  );
}

function bestListTableRow(anchor) {
  const rows = collectAncestorTableRows(anchor);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i];
    if (tr.classList && tr.classList.contains("infobox")) {
      return tr;
    }
  }

  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (!isTableRowInsideNestedListTable(tr) && directListArtCell(tr)) return tr;
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (!isTableRowInsideNestedListTable(tr) && directMainEntryCell(tr)) return tr;
  }
  /* Prefer innermost TR so a wrapper row (e.g. list “edit item” bubble) is not highlighted. */
  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i];
    if (!isTableRowInsideNestedListTable(tr) && !isRymSearchResultsShellRow(tr)) {
      return tr;
    }
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (directListArtCell(tr)) return tr;
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!isRymSearchResultsShellRow(rows[i])) return rows[i];
  }
  return rows[rows.length - 1];
}

function preferTableRowIfAny(el) {
  if (!el) return el;
  const tr = bestListTableRow(el);
  return tr || el;
}

function isReviewsTabOrPaginationHref(href) {
  if (!href || typeof href !== "string") return false;
  let pathname;
  try {
    pathname = new URL(href, RYM_ORIGIN).pathname;
  } catch {
    return false;
  }
  return (
    /^\/release\/[^/]+\/[^/]+\/[^/]+\/reviews(\/\d+)?\/?$/i.test(pathname) ||
    /^\/film\/[^/]+\/reviews(\/\d+)?\/?$/i.test(pathname)
  );
}

function isMediaReviewsSubpagePath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return (
    /^\/release\/[^/]+\/[^/]+\/[^/]+\/reviews(\/\d+)?\/?$/i.test(pathname) ||
    /^\/film\/[^/]+\/reviews(\/\d+)?\/?$/i.test(pathname)
  );
}

function isInlineProseReleaseLink(anchor) {
  if (anchor.closest(".section_artist_biography")) return true;
  const prose = anchor.closest(".rendered_text");
  if (!prose) return false;
  return !prose.closest(
    ".disco_info, tr.infobox, td.list_art, td.main_entry, table.mbgen"
  );
}

function isListItemEditUiContext(anchor) {
  let el = anchor;
  while (el && el !== document.body) {
    if (el.tagName === "TR") {
      if (
        el.querySelector('form[action*="/lists/new_item"]') ||
        el.querySelector("form#item_type_select")
      ) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

function releaseLinkCountIn(el) {
  if (!el || !el.querySelectorAll) return 0;
  return el.querySelectorAll(RYM_LIST_LINK_SELECTOR).length;
}

/** Containers that hold many release/film links (e.g. /contributed/release flat lists). */
function isOversizedReleaseListContainer(el) {
  return releaseLinkCountIn(el) > HIGHLIGHT_MAX_LINKS_FOR_CLASS_MATCH;
}

function findContainerForReleaseLink(anchor) {
  if (anchor.closest(".section_release_navigation")) return null;

  /* Cover / thumbnail links (e.g. list header image) — never highlight their pad wrappers. */
  if (anchor.querySelector("img")) return null;

  if (isListItemEditUiContext(anchor)) return null;

  if (isMediaReviewsSubpagePath(window.location.pathname)) return null;

  if (anchor.closest(".section_reviews, .return_banner")) return null;

  if (isInlineProseReleaseLink(anchor)) return null;

  const hrefAttr = anchor.getAttribute("href");
  if (hrefAttr && isReviewsTabOrPaginationHref(hrefAttr)) {
    return null;
  }

  const infoboxRow = anchor.closest("tr.infobox");
  if (infoboxRow) return infoboxRow;

  let tableRow = bestListTableRow(anchor);
  if (tableRow && isTableRowInsideNestedListTable(tableRow)) {
    const rows = collectAncestorTableRows(anchor);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!isTableRowInsideNestedListTable(rows[i])) {
        tableRow = rows[i];
        break;
      }
    }
  }
  if (tableRow && !isOversizedReleaseListContainer(tableRow)) return tableRow;

  const discoInfo = anchor.closest(".disco_info");
  if (discoInfo) return discoInfo;

  const row =
    anchor.closest("li") || anchor.closest('[role="row"]');
  if (row && !isOversizedReleaseListContainer(row)) return row;

  const albumish = anchor.closest("a.album, a.film, .album, .film, a.list_film");
  if (albumish && albumish !== anchor) {
    return preferTableRowIfAny(albumish);
  }

  let el = anchor.parentElement;
  let depth = 0;
  while (el && el !== document.body && depth < 12) {
    const tag = el.tagName;
    if (tag === "DIV" || tag === "ARTICLE" || tag === "SECTION") {
      const cls = typeof el.className === "string" ? el.className : "";
      const discoRoot = el.closest(".disco_info");
      if (
        discoRoot &&
        el !== discoRoot &&
        (el.classList.contains("disco_mainline") ||
          el.classList.contains("disco_subline"))
      ) {
        el = el.parentElement;
        depth += 1;
        continue;
      }
      const linkCount = releaseLinkCountIn(el);
      if (linkCount > HIGHLIGHT_MAX_LINKS_FOR_CLASS_MATCH) {
        el = el.parentElement;
        depth += 1;
        continue;
      }
      if (linkCount === 1) {
        return preferTableRowIfAny(el);
      }
      if (
        linkCount > 1 &&
        linkCount <= HIGHLIGHT_MAX_LINKS_FOR_CLASS_MATCH &&
        HIGHLIGHT_LIST_CLASS_RE.test(cls)
      ) {
        return preferTableRowIfAny(el);
      }
      if (
        (linkCount === 2 || linkCount === 3) &&
        typeof el.offsetHeight === "number" &&
        el.offsetHeight > 0 &&
        el.offsetHeight <= HIGHLIGHT_ROWISH_MAX_HEIGHT_PX
      ) {
        return preferTableRowIfAny(el);
      }
    }
    el = el.parentElement;
    depth += 1;
  }

  let fallback = anchor.parentElement;
  while (fallback && fallback !== document.body) {
    const tag = fallback.tagName;
    if (
      tag === "SPAN" ||
      tag === "P" ||
      tag === "I" ||
      fallback.classList.contains("rendered_text")
    ) {
      fallback = fallback.parentElement;
      continue;
    }
    /* Flat contributed lists share one parent for dozens of <a>s — never highlight that. */
    if (releaseLinkCountIn(fallback) === 1) {
      return preferTableRowIfAny(fallback);
    }
    fallback = fallback.parentElement;
  }

  /* Last resort: highlight the link itself (e.g. /contributed/release). */
  return anchor;
}

function clearHighlights() {
  document.querySelectorAll("." + HIGHLIGHT_CLASS).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
  document.querySelectorAll("." + BADGE_CLASS).forEach((el) => {
    el.remove();
  });
}

function isArtistPagePath(pathname) {
  return /^\/artist\//i.test(pathname || "");
}

/** Director filmography hub, e.g. /films/stuart_heisler (not /film/slug release pages). */
function isFilmsPersonPagePath(pathname) {
  return /^\/films\//i.test(pathname || "");
}

function isPersonFilmographyHubPath(pathname) {
  return isArtistPagePath(pathname) || isFilmsPersonPagePath(pathname);
}

/** RYM already shows scores in artist/director filmography rows (cataloger, disco_avg_rating). */
function shouldAttachRatingBadge(anchor) {
  if (isPersonFilmographyHubPath(window.location.pathname)) return false;

  const row = anchor.closest("li, .disco_info, .film_info");
  if (!row) return true;

  const hasNativeScore =
    row.querySelector(
      ".disco_avg_rating, .film_rel_img, .disco_cat_inner, [id^='film_cat_catalog_msg_']"
    ) != null;
  const inFilmographyLine = anchor.closest(".film_info, .film_mainline, .disco_mainline");

  return !(hasNativeScore && inFilmographyLine);
}

function getHighlightUiPolicy() {
  const path = window.location.pathname;

  const isUserPage = ["/collection/", "/film_collection/", "/~"].some((prefix) =>
    path.startsWith(prefix)
  );

  const isArtistOrRelease =
    isPersonFilmographyHubPath(path) ||
    path.startsWith("/release/") ||
    /^\/film\//i.test(path);

  const allowHighlights = !isUserPage;
  const allowBadges =
    showListRatings && !isUserPage && !isArtistOrRelease;
  const allowBadgesInReleaseSuggestions =
    showListRatings &&
    !isUserPage &&
    (path.startsWith("/release/") || path.startsWith("/film/"));

  return {
    allowHighlights,
    allowBadges,
    allowBadgesInReleaseSuggestions,
  };
}

function applyHighlights(map) {
  if (!Object.keys(map).length) return;

  const { allowHighlights, allowBadges, allowBadgesInReleaseSuggestions } =
    getHighlightUiPolicy();
  if (!allowHighlights) return;

  clearHighlights();

  injectHighlightStyles();
  if (allowBadges || allowBadgesInReleaseSuggestions) injectBadgeStyles();

  const anchors = document.querySelectorAll(RYM_LIST_LINK_SELECTOR);
  const highlightTargets = new Set();
  anchors.forEach((a) => {
    const normalized = normalizeReleaseUrl(a.getAttribute("href"));
    if (!normalized || !hasRatedKey(map, normalized)) return;

    const target = findContainerForReleaseLink(a);
    if (!target) return;
    highlightTargets.add(target);
  });
  highlightTargets.forEach((el) => {
    el.classList.add(HIGHLIGHT_CLASS);
  });

  anchors.forEach((a) => {
    const normalized = normalizeReleaseUrl(a.getAttribute("href"));
    if (!normalized || !hasRatedKey(map, normalized)) return;

    const rating = getRatingForUrl(map, normalized);
    const ratingTrimmed = rating != null ? String(rating).trim() : "";

    const isImageLink = a.querySelector("img") !== null;
    const hasText = a.textContent.trim().length > 0;

    const allowBadgeHere =
      shouldAttachRatingBadge(a) &&
      (allowBadges ||
        (allowBadgesInReleaseSuggestions &&
          !!a.closest(".section_suggestions")));

    if (
      allowBadgeHere &&
      ratingTrimmed !== "" &&
      !isImageLink &&
      hasText &&
      (!a.nextElementSibling ||
        !a.nextElementSibling.classList.contains(BADGE_CLASS))
    ) {
      const numRating = parseFloat(ratingTrimmed.replace(",", "."));
      let tierClass = "badge-tier-3";

      if (!isNaN(numRating)) {
        if (numRating >= 4.5) {
          tierClass = "badge-tier-5";
        } else if (numRating >= 3.5) {
          tierClass = "badge-tier-4";
        } else if (numRating >= 2.5) {
          tierClass = "badge-tier-3";
        } else if (numRating >= 1.5) {
          tierClass = "badge-tier-2";
        } else {
          tierClass = "badge-tier-1";
        }
      }

      const badge = document.createElement("span");
      badge.className = `${BADGE_CLASS} ${tierClass}`;
      badge.textContent = "\u2605 " + ratingTrimmed;
      a.insertAdjacentElement("afterend", badge);
    }
  });
}

function scheduleApply() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    applyHighlights(ratingsMap);
  }, 120);
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

function setRatedData(raw) {
  ratingsMap = migrateRawToRatingsMap(raw);
  clearHighlights();
  applyHighlights(ratingsMap);
  if (Object.keys(ratingsMap).length) startObserver();
  else stopObserver();
}

chrome.storage.local.get([STORAGE_KEY, STORAGE_SHOW_LIST_RATINGS_KEY], (data) => {
  showListRatings = data[STORAGE_SHOW_LIST_RATINGS_KEY] !== false;
  setRatedData(data[STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY]) {
    setRatedData(changes[STORAGE_KEY].newValue);
    return;
  }
  if (changes[STORAGE_SHOW_LIST_RATINGS_KEY]) {
    showListRatings = changes[STORAGE_SHOW_LIST_RATINGS_KEY].newValue !== false;
    if (!Object.keys(ratingsMap).length) return;
    clearHighlights();
    applyHighlights(ratingsMap);
  }
});
