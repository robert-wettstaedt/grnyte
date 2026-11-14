// Cold-starts a browser on each screen of both builds and prints the median time from first paint to the screen
// settling: Safari in the booted iOS Simulator, or desktop Chromium (Playwright's, Chrome's engine) with
// `BROWSER=chrome`, plus a live-update check.
// Build both worktrees for the local stack first, sign in as admin@ on each origin once (`-- 0` only serves both,
// and in Chrome opens both profiles for that), then: npm run measure:screens -- [runs] [Area,Block,...]
// `ONLY=PowerSync` or `ONLY=Zero` measures one build.
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { openSync, readdirSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

const RUNS = Number(process.argv[2] ?? 3)
const CHROME = process.env.BROWSER === 'chrome'
// Prints each run's sync timeline (per-query and per-collection marks), to find where a slow screen spends its time.
const MARKS = process.env.MARKS === '1'
// No window for Chrome runs (sign-in with `-- 0` keeps one); numbers recorded so far came from a visible window.
const HEADLESS = process.env.HEADLESS === '1'
// Ports the browsers' stores and sign-ins already live on; a new port is a new origin with an empty store.
const BUILDS = [
  { dir: process.cwd(), env: { PUBLIC_SYNC_ONLY_POWERSYNC: '1' }, name: 'PowerSync', port: 4183 },
  { dir: resolve(process.env.ZERO_DIR ?? '../measure-zero'), env: {}, name: 'Zero', port: 4186 },
].filter((b) => process.env.ONLY == null || b.name === process.env.ONLY)
// Route 203 has no grade votes on purpose: its empty votes row is a "none" claim. Map markers are drawn on a canvas
// the probe cannot see, so the map ends at the app's own mark (PowerSync only; Zero's map stays blank).
const SCREENS: { mark?: string; name: string; path: string }[] = [
  { name: 'Area', path: '/areas/26' },
  { name: 'Block', path: '/blocks/49' },
  { name: 'Route', path: '/routes/203' },
  { name: 'Profile', path: '/users/6' },
  { mark: 'map: places ready', name: 'Map', path: '/explore' },
]
const screens = SCREENS.filter((s) => process.argv[3]?.split(',').includes(s.name) ?? true)
const LIVE_ROUTE = 203
const QUIET_MS = 2000
// Bumped with the probe, so a report from a page that kept an older copy is recognised.
const PROBE_VERSION = 5
const PROBE_GIVE_UP_MS = 60_000
const TIMEOUT_MS = 75_000

// Settled = the last DOM change before QUIET_MS without one and with no skeleton left, ignoring the status pill,
// image boxes (a photo loading or failing is not data readiness, and dev photos are missing) and the map, which
// waits behind a sheet on purpose: a sheet screen is timed by its sheet (the map screen ends at its mark). A spinner counts as
// a skeleton: a full-screen loading state has no `aria-busy` and would otherwise read as settled.
// On giving up it names what kept changing or loading, so a run that never settles explains itself. Location is
// denied up front: Safari's per-load permission prompt suspends the page until someone taps it.
// `TRACE_SQL=<text>` records a stack, in `window.__sqlTraces`, for each message to a worker containing that text.
const TRACE = process.env.TRACE_SQL
const TRACER = TRACE
  ? `<script>(()=>{window.__sqlTraces=[];const t=${JSON.stringify(TRACE)};for(const P of [Worker.prototype,MessagePort.prototype]){const o=P.postMessage;P.postMessage=function(m,...r){try{{const j=JSON.stringify(m);if(j.includes(t))window.__sqlTraces.push({at:Math.round(performance.now()),msg:j.slice(-400),stack:new Error().stack})}}catch{}return o.call(this,m,...r)}}})()</script>`
  : ''
const PROBE = `<script>(()=>{const no=(_,err)=>setTimeout(()=>err&&err({code:1,message:'denied'}));
Object.assign(navigator.geolocation,{getCurrentPosition:no,watchPosition:(ok,err)=>(no(ok,err),0),clearWatch:()=>{}});
let last=0,recent=[],errors=[];const err=(...a)=>{errors=[...errors.slice(-4),a.map(x=>x&&x.message||String(x)).join(' ').slice(0,200)]};const ce=console.error;console.error=(...a)=>(err(...a),ce(...a));const cw=console.warn;console.warn=(...a)=>(err(...a),cw(...a));addEventListener('error',e=>err(e.message));addEventListener('unhandledrejection',e=>err(e.reason));const el=n=>n&&(n.nodeType===1?n:n.parentElement);
const pill=n=>(n=el(n))&&(n.closest('[data-face],[role=status],div:has(> img),div:has(> .map)')||n.querySelector('[data-face]'));
const name=n=>(n=el(n))?n.tagName.toLowerCase()+(n.className&&n.className.baseVal==null?'.'+String(n.className).split(' ').slice(0,3).join('.'):''):'?';
new MutationObserver(ms=>{const m=ms.find(m=>!pill(m.target)&&![...m.addedNodes,...m.removedNodes].some(pill));
if(m){last=performance.now();recent=[...recent.slice(-4),m.type+' '+(m.attributeName||'')+' '+name(m.target)]}})
.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
const marks=()=>localStorage.getItem('grnyte:syncMarks');
const send=r=>fetch('/__measure',{method:'POST',keepalive:true,body:JSON.stringify({path:location.pathname,marks:marks(),v:${PROBE_VERSION},...r})});
const busy=()=>[...document.querySelectorAll('[aria-busy=true],[role=progressbar],[data-scope=progress]')].map(n=>{const h=n.closest('section')?.querySelector('h2');return h?'"'+h.textContent.trim()+'"':name(n)+' in '+name(n.parentElement)}).join(' | ')||undefined;
const check=()=>{const now=performance.now();if(!last||now-last<${QUIET_MS}||busy()){if(now<${PROBE_GIVE_UP_MS})setTimeout(check,250);else send({recent,busy:busy(),errors});return}
const fcp=performance.getEntriesByName('first-contentful-paint')[0];send({fcp:fcp&&fcp.startTime,settled:last,trail:recent})};setTimeout(check,250)})()</script>`

type Report = {
  busy?: string
  errors?: string[]
  fcp?: number
  marks?: null | string
  path: string
  recent?: string[]
  settled?: number
  trail?: string[]
  v?: number
}
let waiting: undefined | { done: (r: Report) => void; path: string }

function proxy(port: number, upstream: number) {
  return http
    .createServer((req, res) => {
      if (req.url === '/__measure') {
        let body = ''
        req
          .on('data', (c) => (body += c))
          .on('end', () => {
            const report = JSON.parse(body) as Report
            if (waiting?.path === report.path) waiting.done(report)
            else if (waiting) console.error(`:${port} reported ${report.path} while waiting for ${waiting.path}`)
            res.end()
          })
        return
      }
      const headers = { ...req.headers }
      delete headers['accept-encoding']
      const up = http.request(
        // Kit's `Link` preload header for a page with many modules passes Node's 16 KB default.
        { headers, host: '127.0.0.1', maxHeaderSize: 256 * 1024, method: req.method, path: req.url, port: upstream },
        (ur) => {
          if (!ur.headers['content-type']?.startsWith('text/html')) {
            res.writeHead(ur.statusCode ?? 502, ur.headers)
            ur.pipe(res)
            return
          }
          const chunks: Buffer[] = []
          ur.on('data', (c: Buffer) => chunks.push(c)).on('end', () => {
            const html = Buffer.concat(chunks)
              .toString()
              .replace(/<head[^>]*>/, (head) => head + TRACER + PROBE)
            // Never cached: a page from the browser's cache carries whatever probe it was served with.
            res.writeHead(ur.statusCode ?? 502, {
              ...ur.headers,
              'cache-control': 'no-store',
              'content-length': Buffer.byteLength(html),
            })
            res.end(html)
          })
        },
      )
      up.on('error', (error) => {
        console.error(`:${port} ${req.method} ${req.url} could not reach the preview: ${error.message}`)
        res.writeHead(502).end()
      })
      req.pipe(up)
    })
    .on('error', (error) => {
      console.error(`:${port} is unavailable (${error.message}); stop whatever holds it and run again`)
      void stop().then(() => process.exit(1))
    })
    .listen(port)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const serverLog = (name: string) => resolve(tmpdir(), `measure-${name}-server.log`)
const simctl = (...args: string[]) => execFileSync('xcrun', ['simctl', ...args], { stdio: 'ignore' })
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`
const psql = (sql: string) =>
  execFileSync('docker', ['exec', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql], {
    encoding: 'utf8',
  }).trim()

async function ready(port: number) {
  for (let i = 0; i < 120; i++) {
    const ok = await new Promise((r) =>
      http.get({ host: '127.0.0.1', path: '/', port }, () => r(true)).on('error', () => r(false)),
    )
    if (ok) return
    await sleep(500)
  }
  throw new Error(`preview on :${port} did not start`)
}

function report(path: string, start: () => Promise<unknown> | void): Promise<Report | undefined> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(undefined), TIMEOUT_MS)
    waiting = { done: (r) => (clearTimeout(timer), done(r)), path }
    // A failed navigation is one failed run, not the end of the measurement.
    Promise.resolve(start()).catch((error: unknown) => {
      console.error(`${path}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
      clearTimeout(timer)
      done(undefined)
    })
  })
}

// One persistent profile per build: relaunching it is a cold start with the local store kept, unlike a fresh context.
let context: BrowserContext | undefined
async function chrome(build: string): Promise<Page> {
  await context?.close()
  // The `chromium` channel's headless mode is the full browser without a window, so it never takes focus.
  context = await chromium.launchPersistentContext(resolve(tmpdir(), `measure-chrome-${build}`), {
    channel: 'chromium',
    headless: HEADLESS && RUNS !== 0,
  })
  return context.pages()[0] ?? (await context.newPage())
}

async function open(build: string, url: string): Promise<Page | undefined> {
  if (CHROME) {
    const page = await chrome(build)
    // The HTTP cache only: the local stores (IndexedDB) and the sign-in (cookies) stay.
    await (await page.context().newCDPSession(page)).send('Network.clearBrowserCache')
    await page.goto(url, { waitUntil: 'commit' })
    return page
  }
  try {
    simctl('terminate', 'booted', 'com.apple.mobilesafari')
  } catch {
    // Not running.
  }
  await sleep(2000)
  // Open the URL rather than relaunch Safari, which restores a tab from its own cache without a request.
  simctl('openurl', 'booted', url)
}

// Both builds read the dev stack's values; the Zero worktree has no .env of its own.
const env = { ...process.env, ...parseEnv(readFileSync(resolve(process.cwd(), '.env'), 'utf8')) }
// Read at runtime, and only `vite dev` falls back to the local service: a preview without it never connects.
env.PUBLIC_POWERSYNC_URL ||= 'http://localhost:58100'

// Pages are served from localhost, so a build baked for another origin (a Tailscale .env) cannot sign in.
const LOCAL = { PUBLIC_SUPABASE_URL: 'http://localhost:8000', PUBLIC_ZERO_URL: 'http://localhost:4848' }
for (const b of BUILDS) {
  const dir = resolve(b.dir, '.svelte-kit/output/client/_app/immutable')
  const baked = readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.js'))
    .some((f) => readFileSync(resolve(dir, String(f)), 'utf8').includes(LOCAL.PUBLIC_SUPABASE_URL))
  if (!baked) {
    const vars = Object.entries(LOCAL).map(([k, v]) => `${k}=${v}`)
    console.error(`${b.name} is not built for the local stack. Rebuild: cd ${b.dir} && ${vars.join(' ')} npm run build`)
    process.exit(1)
  }
}
const children: ChildProcess[] = []
const servers: http.Server[] = []
const stop = async () => {
  await context?.close().catch(() => {})
  children.forEach((c) => c.kill())
  servers.forEach((s) => s.close())
}
process.on('SIGINT', () => void stop().then(() => process.exit(130)))

const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)]
const results = new Map<string, number[]>()
// From navigation as well: first paint alone hides an engine that paints late, once its data is there.
const navResults = new Map<string, number[]>()
const live = new Map<string, number[]>()
const failures: string[] = []

const marksOf = (r: Report) => (r.marks ? JSON.parse(r.marks) : []) as [string, number][]

/** Why a settled report does not count, or undefined when it does. */
// fallow-ignore-next-line complexity -- a hand-run measurement script that executes against live builds on import; no test harness
function rejection(r: Report): string | undefined {
  const extras = [r.marks && `\n  sync marks: ${r.marks}`, r.errors?.length && `\n  errors: ${r.errors.join(' | ')}`]
  const reasons: [unknown, string][] = [
    [r.busy, `a skeleton still showing after 60 s in ${r.busy}${extras.filter(Boolean).join('')}`],
    [r.recent, `never settled, last changes: ${r.recent?.join(' | ')}`],
    [r.fcp == null || r.settled == null, 'no first paint recorded'],
    [marksOf(r).some(([name]) => name.startsWith('store open') && name.endsWith(', cold)')), 'store was cold'],
  ]
  return reasons.find(([hit]) => hit)?.[1]
}

/** When the screen settled or reached its mark, in ms since navigation; a string says why the run does not count. */
// fallow-ignore-next-line complexity -- a hand-run measurement script that executes against live builds on import; no test harness
function timing(r: Report | undefined, s: (typeof SCREENS)[number]): number | string {
  if (r == null) return 'the page never loaded'
  const why = rejection(r)
  if (why != null) return why
  const at = s.mark == null ? r.settled : marksOf(r).find(([name]) => name === s.mark)?.[1]
  return at ?? `no "${s.mark}" mark`
}

try {
  for (const b of BUILDS) {
    const vite = resolve(b.dir, 'node_modules/.bin/vite')
    const log = openSync(serverLog(b.name), 'w')
    children.push(
      spawn(vite, ['preview', '--port', String(b.port + 1000), '--strictPort'], {
        cwd: b.dir,
        env: { ...env, ...b.env },
        stdio: ['ignore', log, log],
      }),
    )
    servers.push(proxy(b.port, b.port + 1000))
    await ready(b.port + 1000)
  }
  if (RUNS === 0) {
    console.log(`Serving ${BUILDS.map((b) => `http://localhost:${b.port}`).join(' and ')} until Ctrl+C`)
    if (CHROME) {
      // Each build keeps its own profile, so each needs its own sign-in; the second waits for the first to close.
      for (const b of BUILDS) {
        const page = await chrome(b.name)
        await page.goto(`http://localhost:${b.port}/`)
        console.log(`Sign in as admin@ on :${b.port}, then close that Chrome window`)
        await new Promise((r) => context?.once('close', r))
        context = undefined
      }
    }
    await new Promise(() => {})
  }
  for (const s of screens) {
    for (const b of BUILDS) {
      if (s.mark && b.name === 'Zero') continue
      const url = `http://localhost:${b.port}${s.path}`
      // The warm-up absorbs a first load after a rebuild.
      if (typeof timing(await report(s.path, () => open(b.name, url)), s) === 'string')
        failures.push(`${b.name} ${s.name}: warm-up did not settle`)
      const times: number[] = []
      const fromNav: number[] = []
      for (let i = 1; i <= RUNS; i++) {
        let page: Page | undefined
        const r = await report(s.path, async () => (page = await open(b.name, url)))
        const t = timing(r, s)
        const shot = resolve(tmpdir(), `measure-${b.name}-${s.name}-${i}-settled.png`)
        if (MARKS && page) await page.screenshot({ path: shot })
        if (MARKS && r)
          console.log(
            `${b.name} ${s.name} run ${i}, fcp ${Math.round(r.fcp ?? 0)} ms, settled ${Math.round(r.settled ?? 0)} ms${page ? `, screenshot ${shot}` : ''}` +
              (r.v === PROBE_VERSION
                ? `\n  last changes: ${r.trail?.join(' | ')}`
                : '\n  stale probe: the page was not reloaded through the proxy') +
              `\n  marks: ${r.marks}`,
          )
        if (typeof t === 'number') {
          times.push((t - (r?.fcp ?? 0)) / 1000)
          fromNav.push(t / 1000)
        } else if (r == null && !CHROME) {
          const shot = resolve(tmpdir(), `measure-${b.name}-${s.name}-${i}.png`)
          simctl('io', 'booted', 'screenshot', shot)
          failures.push(`${b.name} ${s.name} run ${i}: ${t} (${shot}; server output in ${serverLog(b.name)})`)
        } else failures.push(`${b.name} ${s.name} run ${i}: ${t}`)
      }
      results.set(`${b.name} ${s.name}`, times)
      navResults.set(`${b.name} ${s.name}`, fromNav)
    }
  }
  // Full runs only: it writes to the shared dev database, which a run of a few screens has no need to touch.
  if (CHROME && process.argv[3] == null) {
    const original = psql(`select name from routes where id = ${LIVE_ROUTE}`)
    for (const b of BUILDS) {
      const times: number[] = []
      for (let i = 1; i <= RUNS; i++) {
        let page: Page | undefined
        await report(
          `/routes/${LIVE_ROUTE}`,
          async () => (page = await open(b.name, `http://localhost:${b.port}/routes/${LIVE_ROUTE}`)),
        )
        const renamed = `${original} live ${Date.now()}`
        try {
          psql(`update routes set name = ${literal(renamed)} where id = ${LIVE_ROUTE}`)
          const started = performance.now()
          await page?.waitForFunction((name) => document.body.innerText.includes(name), renamed, { timeout: 30_000 })
          times.push((performance.now() - started) / 1000)
        } catch {
          failures.push(`${b.name} live update run ${i}: not shown within 30 s`)
        } finally {
          psql(`update routes set name = ${literal(original)} where id = ${LIVE_ROUTE}`)
        }
      }
      live.set(b.name, times)
    }
  }
} finally {
  await stop()
}

const fmt = (xs: number[] | undefined) => (xs?.length ? `${median(xs).toFixed(2)} s` : 'n/a')
const where = CHROME ? 'desktop Chromium cold starts of a warm store' : 'Safari cold starts (Simulator)'
for (const [title, table] of [
  ['First paint to settled', results],
  ['Navigation to settled', navResults],
] as const) {
  console.log(`\n${title}, median of ${RUNS} ${where}\n`)
  console.log(['Screen', ...BUILDS.map((b) => b.name), 'Gap'].join('\t'))
  for (const s of screens) {
    const [ps, zero] = BUILDS.map((b) => table.get(`${b.name} ${s.name}`))
    const gap = ps?.length && zero?.length ? `${(median(ps) - median(zero)).toFixed(2)} s` : 'n/a'
    console.log([s.name, fmt(ps), fmt(zero), gap].join('\t'))
  }
}
if (CHROME) console.log(['Live update', ...BUILDS.map((b) => fmt(live.get(b.name))), ''].join('\t'))
if (failures.length) console.log(`\nDiscarded:\n${failures.join('\n')}`)
