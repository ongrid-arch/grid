/**
 * AIV-19: Grid's tool server over MCP Streamable HTTP, for chat apps (Claude, ChatGPT) that call a
 * server by address. One endpoint, `POST /mcp`, one JSON answer to each message: the same
 * protocol code as the stdio loop (`handleLine`), the hosted tools (`hostedTools.ts`).
 *
 * Stateless: no session, no account, nothing stored. Each call carries its plan, and the server
 * reads and writes no file of its own. A request is JSON, at most `LINE_MAX_BYTES` (1 MiB, as a
 * line of the stdio loop is), and anything else is refused unread. `GET` has no stream to open
 * and `DELETE` no session to end: both are answered 405, as the specification allows.
 *
 * It listens on 127.0.0.1 unless asked for another address. On a loopback address it answers only
 * a request addressed to it (a page of another site renamed to point here is refused). A browser
 * call is let through only from the chat apps' own sites (`ALLOWED_ORIGINS`), with no wildcard;
 * a call that names no origin, as a server's does, needs none.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { say, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { hostedResources, hostedTools, HOSTED_INSTRUCTIONS } from './hostedTools'
import { handleLine, LINE_MAX_BYTES } from './protocol'

/** The port the hosted server asks for when none is named. */
export const HTTP_PORT = 8787
/** The path the one endpoint is served at. */
export const MCP_PATH = '/mcp'
/** The sites whose pages may call the server from a browser. */
export const ALLOWED_ORIGINS: readonly string[] = ['https://claude.ai', 'https://chatgpt.com', 'https://chat.openai.com']

const words = (key: MessageKey, values?: Values): string => say('en', key, values)

export interface HostedServer {
  readonly url: string
  readonly port: number
  close(): Promise<void>
}

function send(response: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  })
  response.end(body)
}

const text = (response: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): void => send(response, status, 'text/plain; charset=utf-8', `${body}\n`, extra)

/** The request's body, or null when it is longer than the tool server reads. */
function bodyOf(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > LINE_MAX_BYTES) {
        resolve(null)
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Starts the hosted server. `port` 0 takes any free port. Nothing is read from the disk: the
 * tools, the page and the guide are all made in memory.
 */
export async function startHostedServer(options: { readonly port?: number; readonly host?: string } = {}): Promise<HostedServer> {
  const host = options.host ?? '127.0.0.1'
  const tools = hostedTools()
  const resources = hostedResources()
  let port = 0
  const own = (): Set<string> => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])

  const server: Server = createServer((request, response) => {
    void (async () => {
      const origin = request.headers.origin
      const allowed = origin !== undefined && ALLOWED_ORIGINS.includes(origin)
      if (LOOPBACK.has(host) && !own().has((request.headers.host ?? '').toLowerCase())) return text(response, 421, words('hosted.http.host'))
      if (origin !== undefined && !allowed) return text(response, 403, words('hosted.http.origin'))
      const cors: Record<string, string> = allowed
        ? {
            'access-control-allow-origin': origin,
            vary: 'Origin',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type, accept, mcp-protocol-version',
            'access-control-max-age': '600',
          }
        : {}
      const path = (request.url ?? '/').split('?', 1)[0]
      if (path === '/healthz' && request.method === 'GET') return text(response, 200, 'ok')
      if (path !== MCP_PATH) return text(response, 404, words('hosted.http.notHere'))
      if (request.method === 'OPTIONS') return send(response, 204, 'text/plain; charset=utf-8', '', cors)
      if (request.method !== 'POST') return text(response, 405, words('hosted.http.post'), { ...cors, allow: 'POST, OPTIONS' })
      if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return text(response, 415, words('hosted.http.notJson'), cors)
      const body = await bodyOf(request)
      if (body === null) return text(response, 413, words('hosted.http.tooLarge', { bytes: LINE_MAX_BYTES }), { ...cors, connection: 'close' })
      let message: unknown
      try {
        message = JSON.parse(body)
      } catch {
        return text(response, 400, words('hosted.http.badJson'), cors)
      }
      // The protocol code reads one line: JSON written on several lines is the same message.
      const line = await handleLine(JSON.stringify(message), tools, resources, HOSTED_INSTRUCTIONS)
      // A notification gets no answer, only the word that it was taken.
      if (line === null) return send(response, 202, 'text/plain; charset=utf-8', '', cors)
      return send(response, 200, 'application/json; charset=utf-8', line, cors)
    })().catch(() => {
      if (!response.headersSent) text(response, 500, 'Error')
      else response.end()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? HTTP_PORT, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  port = (server.address() as AddressInfo).port
  const shown = host.includes(':') ? `[${host}]` : host
  return {
    url: `http://${shown}:${port}${MCP_PATH}`,
    port,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    }),
  }
}
