/**
 * SHT-19: the text behind a sheet's drawn words. The PDF writer keeps one code point per glyph in
 * each font's `ToUnicode` map, and where a face draws a radical and its ideograph with one glyph
 * it picks the radical: 小 would copy as ⼩. This reads the file the writer made and puts the true
 * code point back, so search, copy and screen readers get the characters that were written.
 *
 * It knows only the shape the writer gives: a classic cross reference table and Flate streams.
 * A file that is not shaped so is returned as it came.
 */
import { deflateSync, inflateSync } from 'zlib'

/** Kangxi radicals, the CJK radicals supplement and the compatibility ideographs. */
function isLookalike(code: number): boolean {
  return (code >= 0x2e80 && code <= 0x2fdf) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x2f800 && code <= 0x2fa1f)
}

/** The unified ideograph for a look-alike, as its compatibility form; anything else as it is. */
function trueText(text: string): string {
  const points = [...text]
  return points.length === 1 && isLookalike(points[0]!.codePointAt(0)!) ? text.normalize('NFKC') : text
}

function decodeHex(hex: string): string {
  return Buffer.from(hex, 'hex').swap16().toString('utf16le')
}

function encodeHex(text: string): string {
  return Buffer.from(text, 'utf16le').swap16().toString('hex').toUpperCase()
}

/** A `ToUnicode` map with every look-alike entry written as its true code point. */
export function trueMap(cmap: string): string {
  const fixed = cmap
    .replace(/beginbfchar([\s\S]*?)endbfchar/g, (_all, body: string) => `beginbfchar${body.replace(/<([0-9A-Fa-f]+)>(\s*)<([0-9A-Fa-f]+)>/g, (_m, code: string, gap: string, to: string) => `<${code}>${gap}<${encodeHex(trueText(decodeHex(to)))}>`)}endbfchar`)
    .replace(/\d+ beginbfrange([\s\S]*?)endbfrange/g, (_all, body: string) => {
      const lines = [...body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)]
      const kept: string[] = []
      const single: string[] = []
      for (const [line, lo, hi, to] of lines) {
        const first = decodeHex(to!).codePointAt(0)!
        if (!isLookalike(first)) { kept.push(line); continue }
        const width = lo!.length
        for (let c = Number.parseInt(lo!, 16); c <= Number.parseInt(hi!, 16); c++) {
          single.push(`<${c.toString(16).toUpperCase().padStart(width, '0')}> <${encodeHex(trueText(String.fromCodePoint(first + c - Number.parseInt(lo!, 16))))}>`)
        }
      }
      const parts: string[] = []
      if (kept.length > 0) parts.push(`${kept.length} beginbfrange\n${kept.join('\n')}\nendbfrange`)
      if (single.length > 0) parts.push(`${single.length} beginbfchar\n${single.join('\n')}\nendbfchar`)
      return parts.join('\n')
    })
  return fixed
}

const FORM = /^(\d+) 0 obj\n<<([\s\S]*?)>> stream\n/

/** One object's text, with its stream rewritten when it is a `ToUnicode` map that needs it. */
function fixObject(segment: string): string {
  const head = FORM.exec(segment)
  if (!head || !/\/FlateDecode/.test(head[2]!)) return segment
  const length = /\/Length (\d+)/.exec(head[2]!)
  if (!length) return segment
  const start = head[0].length
  const data = Buffer.from(segment.slice(start, start + Number(length[1])), 'latin1')
  let cmap: string
  try { cmap = inflateSync(data).toString('latin1') } catch { return segment }
  if (!/begincmap/.test(cmap)) return segment
  const fixed = trueMap(cmap)
  if (fixed === cmap) return segment
  const packed = deflateSync(Buffer.from(fixed, 'latin1')).toString('latin1')
  const dict = head[2]!.replace(/\/Length \d+/, `/Length ${packed.length}`)
  return `${head[1]} 0 obj\n<<${dict}>> stream\n${packed}${segment.slice(start + Number(length[1]))}`
}

/** The PDF with every look-alike in its text maps written as the character it stands for. */
export function trueCodePoints(pdf: Uint8Array): Uint8Array {
  const file = Buffer.from(pdf).toString('latin1')
  const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(file)
  if (!startxref) return pdf
  const at = Number(startxref[1])
  const table = /^xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] ?\n)+)(trailer[\s\S]*?)startxref/.exec(file.slice(at))
  if (!table) return pdf
  const entries = [...table[2]!.matchAll(/(\d{10}) (\d{5}) ([nf])/g)].map((m, id) => ({ id, offset: Number(m[1]), gen: m[2]!, used: m[3] === 'n' }))
  if (entries.length !== Number(table[1])) return pdf
  const live = entries.filter((e) => e.used).sort((a, b) => a.offset - b.offset)
  const first = live[0]
  if (!first) return pdf
  let out = file.slice(0, first.offset)
  const moved = new Map<number, number>()
  live.forEach((entry, i) => {
    const end = live[i + 1]?.offset ?? at
    moved.set(entry.id, out.length)
    out += fixObject(file.slice(entry.offset, end))
  })
  const rows = entries.map((e) => `${String(e.used ? moved.get(e.id) : e.offset).padStart(10, '0')} ${e.gen} ${e.used ? 'n' : 'f'} \n`).join('')
  const xref = out.length
  out += `xref\n0 ${entries.length}\n${rows}${table[3]}startxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}
