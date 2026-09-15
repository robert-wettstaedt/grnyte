# Memory leak checks (memlab)

[memlab](https://facebook.github.io/memlab/) drives the app in Chromium, takes three heap snapshots
per scenario (baseline, target, final) and reports objects that survive a round trip they should not.

## Running

```bash
npx puppeteer browsers install chrome   # once; memlab brings puppeteer but not the browser
npm run build && npx vite preview       # http://localhost:4173

MEMLAB_EMAIL=you@grnyte.rocks MEMLAB_PASSWORD=... npm run test:memory
```

Use `npx vite preview`, not `npm run preview`: the latter sets `PREVIEW_HTTPS=1` and Chromium then
refuses the self-signed certificate. Point `MEMLAB_URL` elsewhere to test another origin. Build
before starting the server and not while it runs: `vite preview` serves the hashed files a manifest
named at startup, so a rebuild underneath it kills the next request with `ENOENT ... app.<hash>.js`.

`test:memory` runs `explore-map.cjs`. The other scenario takes the same environment variables:

```bash
npx memlab run --scenario memlab/volume-area.cjs --work-dir .memlab
```

Add `--headful` to watch it drive, and re-analyse the saved snapshots without another run:

```bash
npx memlab analyze detached-DOM --work-dir .memlab
npx memlab analyze unbound-collection --work-dir .memlab
npx memlab trace --node-id <id> --work-dir .memlab
npx memlab view-heap --work-dir .memlab
```

## Naming what a trace points at

A production build mangles every identifier, so a retainer chain reads as `YE` and `nC`. Build
unminified instead and the same chain names the module and the variable:

```bash
npx vite build --minify false && npx vite preview
```

Sourcemaps do not help here: heap snapshots carry the names V8 parsed, and neither memlab nor the
DevTools heap view maps them back. Minifying does not change the measured slope (verified: the same
code gave 7.3MB a cycle both ways), so an unminified run is still comparable to a minified one.

## Reading the output

Expect noise. Zero deliberately keeps synced rows and materialised query views in memory, so
`unbound-collection` flags growth that is the sync engine working as designed. The findings that
matter here are an OpenLayers map or its canvas retained after leaving `/explore` (every instance
comes from `createBaseMap`), a Zero query view that never unsubscribed, and detached DOM from a
sheet or modal. Narrow the rest away with a `leakFilter` in the scenario rather than by eye.

## What has already been measured (2026-09-15)

Rates, after a forced GC, so this is retained memory and not uncollected garbage:

| scenario                        | per cycle | per navigation |
| ------------------------------- | --------- | -------------- |
| `explore-map` (mounts the map)  | 1.8MB     | ~0.9MB         |
| `volume-area` (~100 route rows) | 0.45MB    | ~0.22MB        |

The map is the expensive half, not list size: the leak does not scale with how much a page renders,
and `maintainer@` is in region 18, so both numbers already include the volume fixture.

The retained objects are detached components held through zero-svelte's `Query`, whose constructor
opens a detached `$effect.root` capturing whatever component context is current when it runs. **Do
not try to close those roots from `QueryResource`.** A 2x2 settled it, per cycle / feed-card cluster:
closing neither 1.8MB / present, superseded only 1.9MB / present, live-on-teardown only 7.8MB /
present, both 7.3MB / gone. Only closing every root clears the cluster, and that needs the teardown
half, which drops the shared `ViewWrapper`'s last subscriber so the next visit re-materialises the
whole query (~6MB a navigation). Paying that for a one-time 3.6MB cluster is a bad trade. A real fix
belongs upstream in zero-svelte.

## The browser will not launch

`dlopen ... Google Chrome for Testing Framework (no such file)` is a half-extracted download, not a
missing flag. Wipe it and fetch it again:

```bash
rm -rf ~/.cache/puppeteer/chrome
npx puppeteer browsers install chrome
npx puppeteer browsers list
```

Failing that, point puppeteer at a Chrome you already have:

```bash
PUPPETEER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium npm run test:memory
```
