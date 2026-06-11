# Media Location Editor Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app for browsing media folders, reading GPS metadata from images/videos/XMP sidecars, placing items on an AMap map, and writing updated coordinates back into same-name XMP files.

**Architecture:** A local Node.js service owns filesystem access, metadata scanning, coordinate conversion, and XMP sidecar writes. A Vue 3 frontend served from the same process handles folder browsing, media lists, map interaction, and settings. The backend only allows browsing inside configured library roots, and all writes are limited to same-name `.xmp` files beside the media.

**Tech Stack:** Node.js, Express, Vue 3, Vite, TypeScript, SCSS, AMap JS API, exifr, fast-xml-parser, Vitest, esbuild, pkg.

---

## Product Scope

- Browse a configured library root from the web UI.
- Navigate folders with enter/back/breadcrumb interactions.
- Scan selected folders for photos and videos.
- Match same-name `.xmp` sidecar files beside each media file.
- Read embedded GPS when available.
- Read GPS from same-name XMP when embedded metadata is missing or when the media is a video.
- Show geotagged items on an AMap map.
- Drag a media card onto the map, drag an existing map photo marker, or manually enter coordinates to save a new coordinate pair.
- Disable map panning while a photo marker is being dragged, then restore map panning after the marker is released.
- Render map photo markers with a bottom pointer, using the pointer tip as the coordinate anchor.
- Copy WGS84 map coordinates on left-click without changing media metadata.
- Keep fixed media visible across folder switches without changing the ordering of the current folder list.
- Let the user fix or unfix every media item in the current folder with one action.
- Remove fixed media automatically when its containing configured root is removed.
- Show media panel counts for visible current-folder items, missing-location items, and fixed items.
- Show located media cards with their coordinate pair in the status row; keep missing-location media as a full-row status without a per-card pin control.
- Convert AMap GCJ-02 coordinates back to WGS84 before writing sidecar metadata.
- Persist app settings: AMap key, display version, port, and allowed library roots.

## Non-Goals

- No cloud sync.
- No user accounts.
- No photo editing beyond GPS metadata.
- No browser-side direct filesystem writes.
- No support for writing directly into proprietary video containers in v1; sidecar XMP is the save target.

## Key Decisions

1. The app is a local web service, not Electron.
2. Folder browsing is server-backed and constrained to configured roots.
3. Saving GPS writes only to same-name XMP files in v1.
4. Map interaction uses AMap JS API with GCJ-02 internally, while visible/copyable photo coordinates are shown as WGS84.
5. Internal GPS storage is WGS84, with explicit conversion at map boundaries.
6. Fixed media is client-side session state; it changes visibility only and never deletes or edits files.
7. Removing a configured root also removes any fixed media under that root from the UI.

## Error Handling

- Missing or invalid AMap key shows a settings error and keeps the page usable.
- Disallowed paths are rejected by the backend.
- Missing XMP files do not block browsing or display.
- Unsupported media files remain visible in the folder browser but are not treated as geotaggable items.
- Write failures surface per item and do not abort the full batch.

## Testing Strategy

- Unit test WGS84/GCJ-02 conversion.
- Unit test XMP GPS tag reading and writing.
- Unit test path guard logic so browsing cannot escape the configured roots.
- Smoke test the media scan contract against a temp folder tree.
- Verify the frontend build and server bundle both succeed before delivery.
