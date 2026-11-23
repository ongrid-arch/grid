/**
 * AIV-19: the hosted server's page. An MCP App (MCP Apps, SEP-1865) that draws the plan a tool
 * call carried, floor by floor, from the viewer's own SVG (`planDrawing`, drawn by the server
 * and sent in the result's `_meta` under `grid/drawings`).
 *
 * MCP Apps specification read on 2026-11-23 (modelcontextprotocol/ext-apps, revision 2026-01-26):
 * the resource is `text/html;profile=mcp-app`; a tool links it with `_meta.ui.resourceUri`; the
 * page sends `ui/initialize`, then `ui/notifications/initialized`; the host sends
 * `ui/notifications/tool-result` with a CallToolResult, `_meta` included, and
 * `ui/notifications/host-context-changed` for the theme; the page sends
 * `ui/notifications/size-changed`; `ui/resource-teardown` ends it. With no `csp` declared the
 * host gives the page no network at all, which is all it needs.
 *
 * Unlike the preview page (VEW-4) it calls nothing, polls nothing and stores nothing: the server
 * behind it keeps no state, so what the person sees is the last result it was sent. Its words
 * are given to it (`HostedWords`), so no sentence is written here.
 *
 * `hostedPageMain` is written into the page as its own text, so it refers to nothing outside
 * its own body.
 */

export { HOSTED_DRAWINGS_KEY, HOSTED_RESOURCE_URI } from './names'

export interface HostedWords {
  readonly waiting: string
  readonly noDrawing: string
  readonly floor: string
}

export function hostedPageMain(win: Window & typeof globalThis): { stop(): void } {
  const doc = win.document
  const body = doc.body
  const stage = doc.getElementById('plan') as HTMLElement
  const floorPick = doc.getElementById('floor') as HTMLSelectElement
  const status = doc.getElementById('status') as HTMLElement
  const words = { waiting: body.getAttribute('data-waiting') ?? '', noDrawing: body.getAttribute('data-no-drawing') ?? '' }
  type Drawing = { id: string; name: string; svg: string }
  let drawings: Drawing[] = []
  const asked = 1
  const send = (message: Record<string, unknown>): void => { win.parent.postMessage({ jsonrpc: '2.0', ...message }, '*') }
  const tell = (): void => send({ method: 'ui/notifications/size-changed', params: { width: Math.round(body.scrollWidth), height: Math.max(360, Math.round(body.scrollHeight)) } })

  const svgOf = (): SVGSVGElement | null => stage.querySelector('svg')

  const show = (id: string): void => {
    const drawing = drawings.find((d) => d.id === id) ?? drawings[0]
    if (!drawing) return
    stage.innerHTML = drawing.svg
    const svg = svgOf()
    if (svg) {
      svg.removeAttribute('width')
      svg.removeAttribute('height')
    }
    floorPick.value = drawing.id
    status.textContent = ''
  }

  const take = (result: { _meta?: Record<string, unknown> }): void => {
    // The key is the one `HOSTED_DRAWINGS_KEY` names: this body refers to nothing outside itself.
    const given = result._meta?.['grid/drawings']
    if (!Array.isArray(given) || given.length === 0) {
      status.textContent = words.noDrawing
      return
    }
    drawings = (given as Drawing[]).filter((d) => typeof d.id === 'string' && typeof d.svg === 'string')
    floorPick.replaceChildren(...drawings.map((d) => {
      const option = doc.createElement('option')
      option.value = d.id
      option.textContent = d.name
      return option
    }))
    floorPick.hidden = drawings.length < 2
    show(drawings[0]?.id ?? '')
    tell()
  }

  floorPick.addEventListener('change', () => show(floorPick.value))

  let panFrom: { x: number; y: number; box: number[] } | null = null
  stage.addEventListener('pointerdown', (event) => {
    const box = svgOf()?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    panFrom = box && box.length === 4 ? { x: event.clientX, y: event.clientY, box } : null
  })
  stage.addEventListener('pointermove', (event) => {
    const svg = svgOf()
    if (!panFrom || !svg || event.buttons === 0) return
    const scale = panFrom.box[2]! / Math.max(1, stage.clientWidth)
    svg.setAttribute('viewBox', `${panFrom.box[0]! - (event.clientX - panFrom.x) * scale} ${panFrom.box[1]! - (event.clientY - panFrom.y) * scale} ${panFrom.box[2]} ${panFrom.box[3]}`)
  })
  stage.addEventListener('pointerup', () => { panFrom = null })
  stage.addEventListener('wheel', (event) => {
    const svg = svgOf()
    const box = svg?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    if (!svg || !box || box.length !== 4) return
    event.preventDefault()
    const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15
    const rect = stage.getBoundingClientRect()
    const fx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
    const fy = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
    const [x, y, w, h] = box as [number, number, number, number]
    svg.setAttribute('viewBox', `${x + w * fx * (1 - factor)} ${y + h * fy * (1 - factor)} ${w * factor} ${h * factor}`)
  }, { passive: false })

  status.textContent = words.waiting
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== win.parent) return
    const message = event.data as { id?: number; method?: string; result?: { hostContext?: { theme?: string } }; params?: Record<string, unknown> } | null
    if (!message || typeof message !== 'object') return
    if (message.method === undefined && message.id === asked) {
      const theme = message.result?.hostContext?.theme
      if (theme === 'dark' || theme === 'light') body.setAttribute('data-theme', theme)
      send({ method: 'ui/notifications/initialized', params: {} })
      tell()
    } else if (message.method === 'ui/notifications/tool-result') take((message.params ?? {}) as { _meta?: Record<string, unknown> })
    else if (message.method === 'ui/notifications/host-context-changed') {
      const theme = message.params?.['theme']
      if (theme === 'dark' || theme === 'light') body.setAttribute('data-theme', theme)
    } else if (message.method === 'ui/resource-teardown' || message.method === 'ping') {
      if (message.id !== undefined) send({ id: message.id, result: {} })
    }
  }
  win.addEventListener('message', onMessage)
  send({ id: asked, method: 'ui/initialize', params: { protocolVersion: '2026-01-26', appInfo: { name: 'grid-plan', version: '1' }, appCapabilities: {} } })

  return { stop: () => win.removeEventListener('message', onMessage) }
}

const STYLE = `
:root { color-scheme: light dark; --paper: #fbfaf7; --ink: #1f1d1a; --soft: #6b665e; --line: #d9d5cc; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1c1b19; --ink: #ece9e2; --soft: #a39e94; --line: #3a3833; } }
body[data-theme="dark"] { --paper: #1c1b19; --ink: #ece9e2; --soft: #a39e94; --line: #3a3833; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { display: flex; flex-direction: column; min-height: 360px; background: var(--paper); color: var(--ink); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
header select { font: inherit; padding: 3px 6px; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; }
#status { color: var(--soft); flex: 1 1 auto; overflow-wrap: anywhere; }
#plan { flex: 1 1 auto; min-height: 320px; background: #fbfaf7; cursor: grab; touch-action: none; }
#plan svg { width: 100%; height: 100%; min-height: 320px; display: block; }
`

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The page as one HTML text, with nothing loaded from anywhere else. */
export function hostedPageHtml(words: HostedWords): string {
  const script = `(${hostedPageMain.toString()})(window);`.replace(/<\/script/gi, '<\\/script')
  const body = `<header><select id="floor" aria-label="${escapeAttribute(words.floor)}" hidden></select><span id="status" role="status"></span></header><div id="plan"></div>`
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Grid plan</title>\n<style>${STYLE}</style>\n</head>\n<body data-waiting="${escapeAttribute(words.waiting)}" data-no-drawing="${escapeAttribute(words.noDrawing)}">${body}<script>${script}</script>\n</body>\n</html>\n`
}
