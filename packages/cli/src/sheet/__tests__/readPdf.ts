/**
 * SHT-6: a PDF read back for tests, as Skia writes one: its page size, each painted path in
 * millimetres on the page (from the top-left corner, as the sheet lays it out), and each piece
 * of text. Enough to measure a drawing with a scale rule and read its words, no more: it knows
 * Flate streams, the content operators Skia writes and a font's ToUnicode map, and nothing else.
 */
import { inflateSync } from 'zlib'

const MM_PER_POINT = 25.4 / 72

export interface PdfPath {
  /** The operator that painted it: `f`, `f*`, `S`, `B` and the like. */
  readonly paint: string
  /** Its points in page millimetres, x right and y down from the top-left corner. */
  readonly points: readonly { readonly x: number; readonly y: number }[]
  /** Fill and stroke colour as `r g b`, each 0 to 1, as the content stream writes them. */
  readonly fill: string
  readonly stroke: string
}

export interface PdfText {
  readonly text: string
  /** Where its first letter starts, in page millimetres from the top-left corner. */
  readonly x: number
  readonly y: number
  /** Its letters' height in millimetres (the font size times the scale it is drawn at). */
  readonly size: number
}

export interface PdfPage {
  /** The page in millimetres. */
  readonly width: number
  readonly height: number
  readonly paths: readonly PdfPath[]
  readonly texts: readonly PdfText[]
  /** Whether the file holds an image anywhere: a sheet drawn as vector holds none. */
  readonly hasImage: boolean
}

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `m` then `n`: a point is put through `m` first, as PDF's `cm` concatenates. */
function times(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

const apply = (m: Matrix, x: number, y: number): { x: number; y: number } => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** Every object of the file, by number: its dictionary text and its stream, inflated. */
function objects(pdf: Uint8Array): Map<number, { dict: string; stream: Buffer | null }> {
  const bytes = Buffer.from(pdf)
  const text = bytes.toString('latin1')
  const out = new Map<number, { dict: string; stream: Buffer | null }>()
  for (const match of text.matchAll(/(\d+) 0 obj\b/g)) {
    const start = match.index! + match[0].length
    const end = text.indexOf('endobj', start)
    const body = text.slice(start, end)
    const at = body.search(/stream\r?\n/)
    if (at < 0) { out.set(Number(match[1]), { dict: body, stream: null }); continue }
    const dataStart = start + at + (body.slice(at).startsWith('stream\r\n') ? 8 : 7)
    const dataEnd = text.indexOf('endstream', dataStart)
    const raw = bytes.subarray(dataStart, dataEnd)
    const dict = body.slice(0, at)
    let stream: Buffer
    try { stream = /FlateDecode/.test(dict) ? inflateSync(raw) : raw } catch { stream = raw }
    out.set(Number(match[1]), { dict, stream })
  }
  return out
}

/** A font's codes to text, from its ToUnicode CMap. */
function toUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>()
  const hexText = (hex: string): string => {
    let s = ''
    for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16))
    return s
  }
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, uni] of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(Number.parseInt(code!, 16), hexText(uni!))
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, uni] of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const first = Number.parseInt(uni!, 16)
      for (let c = Number.parseInt(lo!, 16); c <= Number.parseInt(hi!, 16); c++) map.set(c, String.fromCharCode(first + c - Number.parseInt(lo!, 16)))
    }
  }
  return map
}

type Token = { kind: 'num'; value: number } | { kind: 'name'; value: string } | { kind: 'hex'; value: string } | { kind: 'op'; value: string } | { kind: 'array'; value: Token[] }

function tokens(content: string): Token[] {
  const out: Token[] = []
  const stack: Token[][] = [out]
  const re = /\s*(?:(-?(?:\d+\.?\d*|\.\d+))|\/([^\s/<>[\]()]+)|<([0-9A-Fa-f\s]*)>|(\[)|(\])|\(((?:\\.|[^\\)])*)\)|([A-Za-z'"*]+[0-9]?))/gy
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const top = stack.at(-1)!
    if (m[1] !== undefined) top.push({ kind: 'num', value: Number(m[1]) })
    else if (m[2] !== undefined) top.push({ kind: 'name', value: m[2] })
    else if (m[3] !== undefined) top.push({ kind: 'hex', value: m[3].replace(/\s/g, '') })
    else if (m[4] !== undefined) { const array: Token[] = []; top.push({ kind: 'array', value: array }); stack.push(array) }
    else if (m[5] !== undefined) stack.pop()
    else if (m[6] !== undefined) top.push({ kind: 'hex', value: Buffer.from(m[6], 'latin1').toString('hex') })
    else if (m[7] !== undefined) top.push({ kind: 'op', value: m[7] })
    if (re.lastIndex >= content.length) break
  }
  return out
}

/** SHT-20: how many pages a PDF Skia wrote has. */
export function pdfPageCount(pdf: Uint8Array): number {
  return [...objects(pdf).values()].filter((o) => /\/Type\s*\/Page(?![s\w])/.test(o.dict)).length
}

/** Reads a page of a PDF Skia wrote: the first, else the one at `index` (SHT-20), in the order written. */
export function readPdf(pdf: Uint8Array, index = 0): PdfPage {
  const all = objects(pdf)
  const file = Buffer.from(pdf).toString('latin1')
  const page = [...all.values()].filter((o) => /\/Type\s*\/Page(?![s\w])/.test(o.dict))[index]
  if (!page) throw new Error('no page in the PDF')
  const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(page.dict)!
  const widthPt = Number(box[3]) - Number(box[1])
  const heightPt = Number(box[4]) - Number(box[2])
  const fonts = new Map<string, Map<number, string>>()
  for (const [, name, id] of page.dict.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
    const font = all.get(Number(id))
    const unicode = font && /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict)
    const cmap = unicode ? all.get(Number(unicode[1]))?.stream?.toString('latin1') : undefined
    fonts.set(name!, cmap ? toUnicode(cmap) : new Map())
  }
  const contents = /\/Contents\s+(\d+)\s+0\s+R/.exec(page.dict)!
  const content = all.get(Number(contents[1]))!.stream!.toString('latin1')

  // The page's own frame: PDF's y up from the bottom, turned to millimetres from the top-left.
  const toPage: Matrix = [MM_PER_POINT, 0, 0, -MM_PER_POINT, 0, heightPt * MM_PER_POINT]
  let ctm: Matrix = IDENTITY
  const saved: { ctm: Matrix; fill: string; stroke: string }[] = []
  let fill = '0 0 0'
  let stroke = '0 0 0'
  let path: { x: number; y: number }[] = []
  const paths: PdfPath[] = []
  const texts: { text: string; x: number; y: number; size: number }[] = []
  let font = new Map<number, string>()
  let fontSize = 0
  let tm: Matrix = IDENTITY
  let line: Matrix = IDENTITY
  let current: { text: string; x: number; y: number; size: number } | null = null
  const operands: Token[] = []
  const nums = (): number[] => operands.map((t) => (t.kind === 'num' ? t.value : NaN))
  const point = (x: number, y: number): { x: number; y: number } => { const p = apply(times(ctm, toPage), x, y); return p }
  const show = (hex: string): void => {
    const text = [...Buffer.from(hex, 'hex')].map((code) => font.get(code) ?? '').join('')
    const m = times(times(tm, ctm), toPage)
    if (current === null) {
      const at = apply(m, 0, 0)
      current = { text: '', x: at.x, y: at.y, size: fontSize * Math.hypot(m[2], m[3]) }
    }
    current.text += text
  }
  for (const token of tokens(content)) {
    if (token.kind !== 'op') { operands.push(token); continue }
    const v = nums()
    switch (token.value) {
      case 'q': saved.push({ ctm, fill, stroke }); break
      case 'Q': { const s = saved.pop(); if (s) ({ ctm, fill, stroke } = s); break }
      case 'cm': ctm = times(v as Matrix, ctm); break
      case 'rg': fill = v.join(' '); break
      case 'RG': stroke = v.join(' '); break
      case 'g': fill = `${v[0]} ${v[0]} ${v[0]}`; break
      case 'G': stroke = `${v[0]} ${v[0]} ${v[0]}`; break
      case 'm': case 'l': path.push(point(v[0]!, v[1]!)); break
      case 'c': path.push(point(v[0]!, v[1]!), point(v[2]!, v[3]!), point(v[4]!, v[5]!)); break
      case 'v': case 'y': path.push(point(v[0]!, v[1]!), point(v[2]!, v[3]!)); break
      case 're': {
        const [x, y, w, h] = v as [number, number, number, number]
        path.push(point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h))
        break
      }
      case 'h': break
      case 'f': case 'F': case 'f*': case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*':
        paths.push({ paint: token.value, points: path, fill, stroke })
        path = []
        break
      case 'n': path = []; break
      case 'BT': tm = IDENTITY; line = IDENTITY; current = null; break
      case 'ET': {
        // Skia writes each word, and each space, as a text of its own: one that goes on the
        // line the last one is on, at its size, is joined to it.
        const last = texts.at(-1)
        // Set by `show`, a closure, so the type is said here.
        const piece = current as PdfText | null
        if (piece !== null && last && Math.abs(last.y - piece.y) < 0.05 && Math.abs(last.size - piece.size) < 0.01 && piece.x > last.x) texts[texts.length - 1] = { ...last, text: last.text + piece.text }
        else if (piece !== null) texts.push({ ...piece })
        current = null
        break
      }
      case 'Tf': font = fonts.get((operands[0] as { value: string }).value) ?? new Map(); fontSize = v[1]!; break
      case 'Tm': tm = v as Matrix; line = tm; break
      case 'Td': line = times([1, 0, 0, 1, v[0]!, v[1]!], line); tm = line; break
      case 'Tj': show((operands[0] as { value: string }).value); break
      case 'TJ': for (const part of (operands[0] as { value: Token[] }).value) if (part.kind === 'hex') show(part.value); break
    }
    operands.length = 0
  }
  return { width: widthPt * MM_PER_POINT, height: heightPt * MM_PER_POINT, paths, texts, hasImage: /\/Subtype\s*\/Image/.test(file) }
}

/** The extent of some paths' points, in millimetres. */
export function extentOf(paths: readonly PdfPath[]): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
  const xs = paths.flatMap((p) => p.points.map((q) => q.x))
  const ys = paths.flatMap((p) => p.points.map((q) => q.y))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}
