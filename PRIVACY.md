# Privacy Policy — Marker for RYM

**Last updated:** September 23, 2026

Marker for RYM (“the extension”) is a browser extension for [Rate Your Music](https://rateyourmusic.com). This policy explains what data is involved and how it is handled.

## Summary

We do **not** collect, sell, or send your personal data to any third-party servers operated by the extension author. Rating data used by the extension stays on **your device**.

## What the extension does

1. When you click **Sync Ratings** (or **Force Full Sync**), the extension reads your rated music and film items from Rate Your Music **in your open browser tab**, using your existing logged-in session.
2. Those ratings are saved in the browser’s **local extension storage** (`storage.local`).
3. On Rate Your Music pages, the extension uses that local data to **highlight** rated items and optionally show **★ rating badges**.

## Data stored on your device

- URLs (or normalized keys) of releases/films you have rated, and your rating values as shown by RYM.
- Your preference for showing rating badges (on/off).
- Temporary sync status messages while a sync is running.

This data never leaves your browser for the purpose of this extension, except for requests the browser already makes to `rateyourmusic.com` while you use the site (the same as normal browsing).

## Data we do not collect

The extension author does **not** operate analytics, advertising, or a backend that receives:

- your RYM password or session cookies (those stay in the browser / with RYM);
- your ratings database;
- browsing history outside what is needed to run on `rateyourmusic.com` pages;
- contact information, payment data, or identifiers for third-party tracking.

## Permissions (why they exist)

- **storage** — save ratings and settings locally.
- **activeTab** / **scripting** — run sync in the active Rate Your Music tab when you use the popup.
- **Host access to rateyourmusic.com** — apply highlights/badges and perform in-tab sync on that site only.

## Third parties

- **Rate Your Music / Sonemic** — you interact with their site under their own terms and privacy policy. The extension does not replace or control RYM’s policies.
- **Browser vendors** (Chrome, Firefox, etc.) and their extension stores may process install/update metadata under their own policies.

## Children

The extension is not directed at children and is not intended to collect children’s data.

## Changes

If this policy changes, the updated text will be posted in this repository. The “Last updated” date at the top will change accordingly.

## Contact / support

Questions, feedback, and privacy-related requests:

- RYM forum thread: https://rym.fm/discussion/rate-your-music/_chrome-extension-marker-for-rym-highlight-your-rated-items-on-charts-and-lists/
- Source repository: https://github.com/noirboi/marker-for-rym
