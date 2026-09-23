# Marker for RYM

A minimal **Chrome and Firefox** extension for [Rate Your Music](https://rateyourmusic.com). It syncs your music and film collection ratings, then highlights releases you’ve already rated on charts, lists, and similar pages. Optional star badges show your score next to titles.

Ratings stay on your device only — nothing is sent to a third-party server.

## News & updates

Announcements, feedback, and support (RYM forum):  
https://rym.fm/discussion/rate-your-music/_chrome-extension-marker-for-rym-highlight-your-rated-items-on-charts-and-lists/

## Features

- Sync rated music and films from your RYM collection (runs in your open RYM tab)
- Soft green row highlights for rated items on list-style pages
- Optional ★ rating badges (can be turned off in the popup)
- Local storage only (`chrome.storage.local`)

## Install (Chrome)

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Pin **Marker for RYM** from the toolbar if you like.

## Install (Firefox)

Requires **Firefox 140+** (Manifest V3 sync uses `world: "MAIN"`; AMO data-collection declaration needs 140+).

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `manifest.json` in this folder.
5. Open a [rateyourmusic.com](https://rateyourmusic.com) tab, then use the toolbar button.

Temporary add-ons are removed when Firefox restarts. For a permanent install, use a build from [addons.mozilla.org](https://addons.mozilla.org) once published, or keep reloading via `about:debugging` while developing.

## How to use

1. Log in on [rateyourmusic.com](https://rateyourmusic.com).
2. Open the extension popup.
3. Click **Sync Ratings** (leave the popup open to see progress).
4. Browse charts and lists — rated items are highlighted.
5. Use **Show Rating Badges** to toggle ★ labels on list pages.
6. Use **Force Full Sync** only when you want a full re-sync instead of the usual update.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your synced ratings locally |
| `activeTab` / `scripting` | Run sync in the current RYM tab |
| Host access to `rateyourmusic.com` | Read collection pages and apply highlights |

## Privacy

- Sync uses your logged-in RYM session in the browser tab.
- Rating data is stored locally in Chrome/Firefox storage.
- No analytics backend and no upload of your collection to this project’s authors.

Full policy: [PRIVACY.md](PRIVACY.md)

## Development

Chrome / Firefox Manifest V3. Same codebase for both browsers. Main files:

- `manifest.json` — extension config (`browser_specific_settings.gecko` for Firefox)
- `popup.html` / `popup.js` — popup UI and sync controls
- `content.js` — highlights and badges on RYM pages
- `page-context-sync.js` — in-page collection sync helper (injected into the page)

## License

MIT — see [LICENSE](LICENSE).
