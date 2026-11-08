// A headless PowerSync client on the wire protocol: streamed NDJSON, resuming from its bucket positions. It
// keeps the rows it receives, so a test can ask what a user holds. Used by `scripts/measure.ts` and the stream
// client test.
import { randomUUID } from 'node:crypto'
import http, { type ClientRequest } from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'

type Data = Record<string, unknown>
interface Line {
  checkpoint?: { buckets: { bucket: string }[] }
  checkpoint_complete?: unknown
  checkpoint_diff?: { removed_buckets: string[]; updated_buckets: { bucket: string }[] }
  data?: { bucket: string; data: Op[]; next_after: string }
  error?: unknown
}
interface Op {
  data: string
  object_id: string
  object_type: string
  op: 'CLEAR' | 'MOVE' | 'PUT' | 'REMOVE'
}
interface Options {
  encoding?: string
  endpoint: string
  /** Replaces the default streams with exactly these. */
  streams?: string[]
  /** Opened beside the default streams. */
  subscriptions?: { parameters: Data; stream: string }[]
  token: string
}

export class PsClient {
  /** bucket -> op id received up to */
  readonly buckets = new Map<string, string>()
  bytes = 0
  readonly clientId = randomUUID()
  /** error lines the service sent */
  readonly errors: unknown[] = []
  ops = 0
  /** `${table}/${id}` -> row, as the device would hold it */
  readonly rows = new Map<string, { buckets: Set<string>; data: Data }>()
  #closing = false
  #complete?: () => void
  #failed?: (error: Error) => void
  #req?: ClientRequest

  constructor(private readonly options: Options) {}

  /** Connects and resolves at the first `checkpoint_complete`: the client then holds everything. */
  connect(): Promise<void> {
    this.ops = 0
    this.bytes = 0
    this.#closing = false
    const { encoding = 'gzip', endpoint, streams, subscriptions = [], token } = this.options
    const url = new URL('/sync/stream', endpoint)
    const body = JSON.stringify({
      buckets: [...this.buckets].map(([name, after]) => ({ after, name })),
      client_id: this.clientId,
      include_checksum: true,
      raw_data: true,
      streams: {
        include_defaults: streams == null,
        subscriptions: [
          ...(streams ?? []).map((stream) => ({ override_priority: null, parameters: null, stream })),
          ...subscriptions.map(({ parameters, stream }) => ({ override_priority: null, parameters, stream })),
        ],
      },
    })
    return new Promise((resolve, reject) => {
      this.#complete = resolve
      this.#failed = reject
      this.#req = (url.protocol === 'https:' ? https : http).request(
        url,
        {
          headers: {
            accept: 'application/x-ndjson',
            'accept-encoding': encoding,
            authorization: `Token ${token}`,
            'content-length': Buffer.byteLength(body),
            'content-type': 'application/json',
          },
          method: 'POST',
        },
        (res) => {
          if (res.statusCode !== 200) reject(new Error(`sync stream ${res.statusCode}`))
          res.on('data', (chunk: Buffer) => (this.bytes += chunk.length))
          const enc = res.headers['content-encoding']
          const stream =
            enc === 'gzip'
              ? res.pipe(zlib.createGunzip())
              : enc === 'zstd'
                ? res.pipe(zlib.createZstdDecompress())
                : res
          let buffer = ''
          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8')
            let i
            while ((i = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, i)
              buffer = buffer.slice(i + 1)
              if (line.trim()) this.#line(JSON.parse(line) as Line)
            }
          })
          stream.on('error', () => {})
        },
      )
      this.#req.on('error', (error) => this.#closing || reject(error))
      this.#req.end(body)
    })
  }

  disconnect(): void {
    this.#closing = true
    this.#req?.destroy()
  }

  /** Rows of one table the client holds. */
  // fallow-ignore-next-line unused-class-member -- read by streams.local.server.test.ts, which fallow does not see
  table(name: string): Data[] {
    return [...this.rows].filter(([key]) => key.startsWith(`${name}/`)).map(([, row]) => row.data)
  }

  #addBuckets(buckets: Iterable<string>) {
    for (const bucket of buckets) if (!this.buckets.has(bucket)) this.buckets.set(bucket, '0')
  }

  // Rows remember which buckets hold them, so leaving a bucket removes only what no other bucket still holds.
  #apply(bucket: string, op: Op) {
    const key = `${op.object_type}/${op.object_id}`
    const row = this.rows.get(key)
    if (op.op === 'PUT') {
      this.rows.set(key, { buckets: new Set([...(row?.buckets ?? []), bucket]), data: JSON.parse(op.data) as Data })
    } else if (op.op === 'REMOVE' && row != null) {
      row.buckets.delete(bucket)
      if (row.buckets.size === 0) this.rows.delete(key)
    }
  }

  #data(data: NonNullable<Line['data']>) {
    this.ops += data.data.length
    for (const op of data.data) this.#apply(data.bucket, op)
    this.buckets.set(data.bucket, data.next_after)
  }

  #dropBucket(bucket: string) {
    this.buckets.delete(bucket)
    for (const [key, row] of this.rows) {
      row.buckets.delete(bucket)
      if (row.buckets.size === 0) this.rows.delete(key)
    }
  }

  // fallow-ignore-next-line complexity -- one branch per sync line kind; streams.local.server.test.ts drives it, unseen by fallow
  #line(message: Line) {
    if (message.checkpoint) {
      const keep = new Set(message.checkpoint.buckets.map((b) => b.bucket))
      this.#addBuckets(keep)
      for (const bucket of [...this.buckets.keys()]) if (!keep.has(bucket)) this.#dropBucket(bucket)
    } else if (message.checkpoint_diff) {
      this.#addBuckets(message.checkpoint_diff.updated_buckets.map((b) => b.bucket))
      for (const bucket of message.checkpoint_diff.removed_buckets) this.#dropBucket(bucket)
    } else if (message.data) {
      this.#data(message.data)
    } else if (message.checkpoint_complete) {
      this.#complete?.()
    } else if (message.error) {
      this.errors.push(message.error)
      this.#failed?.(new Error(JSON.stringify(message.error)))
    }
  }
}

/** Signs in through GoTrue with a password and returns the access token. */
export async function signIn(options: {
  anonKey: string
  authUrl: string
  email: string
  password: string
}): Promise<string> {
  const res = await fetch(`${options.authUrl}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email: options.email, password: options.password }),
    headers: { apikey: options.anonKey, 'content-type': 'application/json' },
    method: 'POST',
  })
  const body = (await res.json()) as { access_token?: string }
  if (body.access_token == null) throw new Error(`sign-in failed for ${options.email}: ${res.status}`)
  return body.access_token
}
