// Cold-starts Safari in the booted iOS Simulator on each screen of both builds and prints the median time
// from first paint to the screen settling. Build both worktrees first (`npm run build`), sign in as admin@
// on each origin once (`-- 0` only serves both, for signing in), then: npm run measure:screens -- [runs] [Area,Block,...]
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { openSync, readdirSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

const RUNS = Number(process.argv[2] ?? 3)
// Ports the Simulator's stores and sign-ins already live on; a new port is a new origin with an empty store.
const BUILDS = [
  { dir: process.cwd(), name: 'PowerSync', port: 4183 },
  { dir: resolve(process.env.ZERO_DIR ?? '../measure-zero'), name: 'Zero', port: 4186 },
]
const SCREENS = [
  { name: 'Area', path: '/areas/26' },
  { name: 'Block', path: '/blocks/49' },
  { name: 'Route', path: '/routes/203' },
  { name: 'Profile', path: '/users/6' },
]
const screens = SCREENS.filter((s) => process.argv[3]?.split(',').includes(s.name) ?? true)
const QUIET_MS = 2000
const PROBE_GIVE_UP_MS = 60_000
const TIMEOUT_MS = 75_000

// Settled = the last DOM change before QUIET_MS without one and with no skeleton left, ignoring the status pill.
// On giving up it names what kept changing or loading, so a run that never settles explains itself. Location is
// denied up front: Safari's per-load permission prompt suspends the page until someone taps it.
const PROBE = `<script>(()=>{const no=(_,err)=>setTimeout(()=>err&&err({code:1,message:'denied'}));
Object.assign(navigator.geolocation,{getCurrentPosition:no,watchPosition:(ok,err)=>(no(ok,err),0),clearWatch:()=>{}});
let last=0,recent=[],errors=[];const err=(...a)=>{errors=[...errors.slice(-4),a.map(x=>x&&x.message||String(x)).join(' ').slice(0,200)]};const ce=console.error;console.error=(...a)=>(err(...a),ce(...a));const cw=console.warn;console.warn=(...a)=>(err(...a),cw(...a));addEventListener('error',e=>err(e.message));addEventListener('unhandledrejection',e=>err(e.reason));const el=n=>n&&(n.nodeType===1?n:n.parentElement);
const pill=n=>(n=el(n))&&(n.closest('[data-face],[role=status]')||n.querySelector('[data-face]'));
const name=n=>(n=el(n))?n.tagName.toLowerCase()+(n.className&&n.className.baseVal==null?'.'+String(n.className).split(' ').slice(0,3).join('.'):''):'?';
new MutationObserver(ms=>{const m=ms.find(m=>!pill(m.target)&&![...m.addedNodes,...m.removedNodes].some(pill));
if(m){last=performance.now();recent=[...recent.slice(-4),m.type+' '+(m.attributeName||'')+' '+name(m.target)]}})
.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
const send=r=>fetch('/__measure',{method:'POST',keepalive:true,body:JSON.stringify({path:location.pathname,...r})});
const busy=()=>[...document.querySelectorAll('[aria-busy=true]')].map(n=>{const h=n.closest('section')?.querySelector('h2');return h?'"'+h.textContent.trim()+'"':name(n)+' in '+name(n.parentElement)}).join(' | ')||undefined;
const check=()=>{const now=performance.now();if(!last||now-last<${QUIET_MS}||busy()){if(now<${PROBE_GIVE_UP_MS})setTimeout(check,250);else send({recent,busy:busy(),marks:localStorage.getItem('grnyte:syncMarks'),errors});return}
const fcp=performance.getEntriesByName('first-contentful-paint')[0];send({fcp:fcp&&fcp.startTime,settled:last})};setTimeout(check,250)})()</script>`

type Report = {
  busy?: string
  errors?: string[]
  fcp?: number
  marks?: string
  path: string
  recent?: string[]
  settled?: number
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
        { headers, host: '127.0.0.1', method: req.method, path: req.url, port: upstream },
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
              .replace(/<head[^>]*>/, (head) => head + PROBE)
            res.writeHead(ur.statusCode ?? 502, { ...ur.headers, 'content-length': Buffer.byteLength(html) })
            res.end(html)
          })
        },
      )
      up.on('error', () => res.writeHead(502).end())
      req.pipe(up)
    })
    .on('error', (error) => {
      console.error(`:${port} is unavailable (${error.message}); stop whatever holds it and run again`)
      stop()
      process.exit(1)
    })
    .listen(port)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const serverLog = (name: string) => resolve(tmpdir(), `measure-${name}-server.log`)
const simctl = (...args: string[]) => execFileSync('xcrun', ['simctl', ...args], { stdio: 'ignore' })

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

function report(path: string, start: () => void): Promise<Report | undefined> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(undefined), TIMEOUT_MS)
    waiting = { done: (r) => (clearTimeout(timer), done(r)), path }
    start()
  })
}

// Both builds read the dev stack's values; the Zero worktree has no .env of its own.
const env = { ...process.env, ...parseEnv(readFileSync(resolve(BUILDS[0].dir, '.env'), 'utf8')) }
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
const stop = () => {
  children.forEach((c) => c.kill())
  servers.forEach((s) => s.close())
}
process.on('SIGINT', () => (stop(), process.exit(130)))

const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)]
const results = new Map<string, number[]>()
const failures: string[] = []

try {
  for (const b of BUILDS) {
    const vite = resolve(b.dir, 'node_modules/.bin/vite')
    const log = openSync(serverLog(b.name), 'w')
    children.push(
      spawn(vite, ['preview', '--port', String(b.port + 1000), '--strictPort'], {
        cwd: b.dir,
        env,
        stdio: ['ignore', log, log],
      }),
    )
    servers.push(proxy(b.port, b.port + 1000))
    await ready(b.port + 1000)
  }
  if (RUNS === 0) {
    console.log(`Serving ${BUILDS.map((b) => `http://localhost:${b.port}`).join(' and ')} until Ctrl+C`)
    await new Promise(() => {})
  }
  for (const s of screens) {
    for (const b of BUILDS) {
      const url = `http://localhost:${b.port}${s.path}`
      // The warm-up absorbs a first load after a rebuild. Runs open the URL rather than relaunch Safari,
      // which restores a tab from its own cache without a request.
      if (!(await report(s.path, () => simctl('openurl', 'booted', url))))
        failures.push(`${b.name} ${s.name}: warm-up timed out`)
      const times: number[] = []
      for (let i = 1; i <= RUNS; i++) {
        try {
          simctl('terminate', 'booted', 'com.apple.mobilesafari')
        } catch {
          // Not running.
        }
        await sleep(2000)
        const r = await report(s.path, () => simctl('openurl', 'booted', url))
        const run = `${b.name} ${s.name} run ${i}`
        if (r == null) {
          const shot = resolve(tmpdir(), `measure-${b.name}-${s.name}-${i}.png`)
          simctl('io', 'booted', 'screenshot', shot)
          failures.push(`${run}: the page never loaded (${shot}; server output in ${serverLog(b.name)})`)
        } else if (r.busy)
          failures.push(
            `${run}: a skeleton still showing after 60 s in ${r.busy}${r.marks ? `\n  sync marks: ${r.marks}` : ''}${r.errors?.length ? `\n  errors: ${r.errors.join(' | ')}` : ''}`,
          )
        else if (r.recent) failures.push(`${run}: never settled, last changes: ${r.recent.join(' | ')}`)
        else if (r.fcp == null || r.settled == null) failures.push(`${run}: no first paint recorded`)
        else times.push((r.settled - r.fcp) / 1000)
      }
      results.set(`${b.name} ${s.name}`, times)
    }
  }
} finally {
  stop()
}

const fmt = (xs: number[] | undefined) => (xs?.length ? `${median(xs).toFixed(2)} s` : 'n/a')
console.log(`\nFirst paint to settled, median of ${RUNS} Safari cold starts (Simulator)\n`)
console.log(['Screen', ...BUILDS.map((b) => b.name), 'Gap'].join('\t'))
for (const s of screens) {
  const [ps, zero] = BUILDS.map((b) => results.get(`${b.name} ${s.name}`))
  const gap = ps?.length && zero?.length ? `${(median(ps) - median(zero)).toFixed(2)} s` : 'n/a'
  console.log([s.name, fmt(ps), fmt(zero), gap].join('\t'))
}
if (failures.length) console.log(`\nDiscarded:\n${failures.join('\n')}`)
