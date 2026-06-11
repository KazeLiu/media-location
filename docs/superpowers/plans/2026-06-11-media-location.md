# Media Location Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vue app plus Node backend that browses media folders, resolves same-name XMP sidecars, displays GPS items on AMap, and writes updated WGS84 coordinates back into sidecar XMP files.

**Architecture:** Keep backend ownership of filesystem and metadata logic. Keep frontend ownership of browsing, selection, map interaction, and settings forms. Share only typed API contracts and GPS/coordinate helpers. Store app settings in a local JSON file and keep the backend as the single source of truth for allowed library roots.

The frontend also keeps client-side fixed-media state so pinned items stay visible when the user switches folders without moving current-folder items into a separate section. Users can toggle the current folder in one action, and removing a configured root clears fixed media that belongs to that root.

**Tech Stack:** Node.js, Express, Vue 3, Vite, TypeScript, SCSS, exifr, fast-xml-parser, Vitest, esbuild, pkg.

---

### Task 1: Scaffold the app shell and shared contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.ts`
- Create: `client/src/App.vue`
- Create: `client/src/styles.scss`
- Create: `shared/contracts.ts`
- Create: `shared/gps.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { wgs84ToGcj02, gcj02ToWgs84 } from '@shared/gps';

describe('gps conversion', () => {
  it('round-trips a known mainland China coordinate', () => {
    const gcj = wgs84ToGcj02(116.397128, 39.916527);
    const wgs = gcj02ToWgs84(gcj.lng, gcj.lat);

    expect(Math.abs(wgs.lng - 116.397128)).toBeLessThan(0.01);
    expect(Math.abs(wgs.lat - 39.916527)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/gps.test.ts -v`
Expected: module-not-found or export-not-found failure until `shared/gps.ts` exists.

- [ ] **Step 3: Write minimal implementation**

```ts
export function wgs84ToGcj02(lng: number, lat: number) {
  return { lng, lat };
}
export function gcj02ToWgs84(lng: number, lat: number) {
  return { lng, lat };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/gps.test.ts -v`
Expected: PASS after real coordinate math is added.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts client shared tests
git commit -m "feat: scaffold media location app"
```

### Task 2: Implement backend config, path guards, and folder browsing

**Files:**
- Create: `server/src/config.ts`
- Create: `server/src/fs.ts`
- Create: `server/src/routes.ts`
- Create: `server/src/index.ts`
- Create: `tests/fs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ensureWithinRoots } from '../server/src/fs';

describe('path guards', () => {
  it('rejects paths outside configured roots', () => {
    expect(() => ensureWithinRoots('C:/secret', ['D:/library'])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/fs.test.ts -v`
Expected: export-not-found until `server/src/fs.ts` exists.

- [ ] **Step 3: Write minimal implementation**

```ts
export function ensureWithinRoots(candidate: string, roots: string[]) {
  // Normalize and verify candidate starts with one of the allowed roots.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/fs.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src tests/fs.test.ts
git commit -m "feat: add directory browsing backend"
```

### Task 3: Implement XMP sidecar read/write and media scanning

**Files:**
- Create: `server/src/xmp.ts`
- Create: `server/src/media.ts`
- Create: `tests/xmp.test.ts`
- Create: `tests/media.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildXmpWithGps, parseGpsFromXmp } from '../server/src/xmp';

describe('xmp gps', () => {
  it('writes and reads gps tags', () => {
    const xmp = buildXmpWithGps({ latitude: 39.916527, longitude: 116.397128 });
    const gps = parseGpsFromXmp(xmp);

    expect(gps?.latitude).toBeCloseTo(39.916527, 6);
    expect(gps?.longitude).toBeCloseTo(116.397128, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/xmp.test.ts -v`
Expected: export-not-found until `server/src/xmp.ts` exists.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildXmpWithGps(gps) {
  return `...`;
}
export function parseGpsFromXmp(xmp) {
  return { latitude: 0, longitude: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/xmp.test.ts -v`
Expected: PASS with real parsing logic.

- [ ] **Step 5: Commit**

```bash
git add server/src tests/xmp.test.ts tests/media.test.ts
git commit -m "feat: add xmp metadata handling"
```

### Task 4: Build the Vue UI for folder browsing, map selection, and saving

**Files:**
- Modify: `client/src/App.vue`
- Create: `client/src/api.ts`
- Create: `client/src/components/DirectoryBrowser.vue`
- Create: `client/src/components/MediaTable.vue`
- Create: `client/src/components/MapPanel.vue`
- Create: `client/src/components/SettingsPanel.vue`

- [ ] **Step 1: Write the failing test**

```ts
// Frontend smoke tests can be limited to build-time validation for this task.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build:client`
Expected: fail until the Vue page and API client exist.

- [ ] **Step 3: Write minimal implementation**

```vue
<template>
  <main class="app-shell">
    <!-- directory browser, media table, map, and settings -->
  </main>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat: add media location ui"
```

### Task 5: Wire production startup and packaging

**Files:**
- Modify: `server/src/index.ts`
- Modify: `package.json`
- Create: `README.md`

- [ ] **Step 1: Write the failing test**

```ts
// Verify the production server bundle starts and serves the built frontend.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: fail until the backend and frontend are wired together.

- [ ] **Step 3: Write minimal implementation**

```ts
// Serve dist/client from the backend in production and open the local URL on boot.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src package.json README.md
git commit -m "chore: wire production packaging"
```
