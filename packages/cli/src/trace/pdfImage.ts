/**
 * VEW-67 (C31): a page of a PDF as a trace image. A scanned sheet is a PDF whose page holds one
 * raster picture; that picture, the largest on the page, is what is traced, in its own pixels.
 * This reads just enough of the file to find it: its objects (also those packed in object
 * streams), the page tree in order, each page's images and those of its forms. Objects are found
 * by scanning the file, so a PDF updated in place or with a compressed cross-reference is read
 * without trusting its offsets; the last definition of an object wins.
 *
 * A JPEG picture (`DCTDecode`) is handed on as it is; a deflated one of grey (1, 2, 4 or 8 bits)
 * or RGB (8 bits) pixels is written out as a PNG. A page drawn only in lines and text, as a CAD
 * program exports one, has no picture: drawing its lines needs a PDF renderer, which Grid does
 * not ship. Nothing here reads a file: the caller hands over the bytes.
 */
import { crc32, deflateSync, inflateSync } from 'zlib'

/** The most bytes one stream may inflate to: well past a 16,384-pixel RGB scan's rows. */
const INFLATED_MAX = 1024 * 1024 * 1024

/** How deep page trees and forms are walked, against a file that points round in a circle. */
const DEPTH_MAX = 32

interface Ref {
  readonly ref: number
}
interface Name {
  readonly name: string
}
type Value = number | boolean | null | string | Name | Ref | Value[] | Dict
type Dict = Map<string, Value>

interface PdfObject {
  readonly value: Value
  /** Where its stream's bytes start, when it is a stream. */
  readonly stream?: number
}

export type PdfPictureKind = 'png' | 'jpeg'

export interface PdfPicture {
  readonly kind: PdfPictureKind
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
}

/** What became of the page asked for: its picture, or why it has none. */
export type PdfRead =
  | { readonly picture: PdfPicture; readonly pages: number }
  | { readonly problem: 'notPdf' | 'noPage' | 'noPicture'; readonly pages: number }
  | { readonly problem: 'pictureKind'; readonly pages: number; readonly kind: string }

/** Whether the bytes start as a PDF does. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
}

const isName = (v: Value | undefined): v is Name => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Map) && 'name' in v
const isRef = (v: Value | undefined): v is Ref => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Map) && 'ref' in v
const isDict = (v: Value | undefined): v is Dict => v instanceof Map
const nameOf = (v: Value | undefined): string | null => (isName(v) ? v.name : null)

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIMITERS = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)))

class Reader {
  at = 0
  constructor(readonly bytes: Uint8Array) {}

  private skip(): void {
    const b = this.bytes
    while (this.at < b.length) {
      if (WHITE.has(b[this.at]!)) this.at++
      else if (b[this.at] === 0x25) while (this.at < b.length && b[this.at] !== 0x0a && b[this.at] !== 0x0d) this.at++
      else return
    }
  }

  private word(): string {
    const b = this.bytes
    const from = this.at
    while (this.at < b.length && !WHITE.has(b[this.at]!) && !DELIMITERS.has(b[this.at]!)) this.at++
    return String.fromCharCode(...b.subarray(from, this.at))
  }

  /** The next token as text, without moving, for `R`, `obj` and `stream` after a value. */
  peekWord(): string {
    const kept = this.at
    this.skip()
    const word = this.word()
    this.at = kept
    return word
  }

  value(depth = 0): Value {
    if (depth > DEPTH_MAX) throw new Error('depth')
    this.skip()
    const b = this.bytes
    const c = b[this.at]
    if (c === undefined) throw new Error('end')
    if (c === 0x3c && b[this.at + 1] === 0x3c) {
      this.at += 2
      const dict: Dict = new Map()
      for (;;) {
        this.skip()
        if (b[this.at] === 0x3e && b[this.at + 1] === 0x3e) {
          this.at += 2
          return dict
        }
        const key = this.value(depth + 1)
        if (!isName(key)) throw new Error('key')
        dict.set(key.name, this.value(depth + 1))
      }
    }
    if (c === 0x3c) {
      const end = b.indexOf(0x3e, this.at)
      if (end < 0) throw new Error('string')
      this.at = end + 1
      return ''
    }
    if (c === 0x5b) {
      this.at++
      const list: Value[] = []
      for (;;) {
        this.skip()
        if (b[this.at] === 0x5d) {
          this.at++
          return list
        }
        if (this.at >= b.length) throw new Error('array')
        list.push(this.value(depth + 1))
      }
    }
    if (c === 0x28) {
      let open = 0
      for (; this.at < b.length; this.at++) {
        const d = b[this.at]
        if (d === 0x5c) this.at++
        else if (d === 0x28) open++
        else if (d === 0x29 && --open === 0) break
      }
      this.at++
      return ''
    }
    if (c === 0x2f) {
      this.at++
      return { name: this.word().replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))) }
    }
    const word = this.word()
    if (word === '') throw new Error('token')
    if (word === 'true' || word === 'false') return word === 'true'
    if (word === 'null') return null
    const n = Number(word)
    if (!Number.isFinite(n)) throw new Error('token')
    // `n g R` is a reference to object n.
    if (Number.isInteger(n) && n >= 0) {
      const kept = this.at
      this.skip()
      const generation = this.word()
      if (/^\d+$/.test(generation) && this.peekWord() === 'R') {
        this.skip()
        this.word()
        return { ref: n }
      }
      this.at = kept
    }
    return n
  }
}

/** The PDF's objects by number, found by scanning the file and its object streams. */
class PdfFile {
  readonly objects = new Map<number, PdfObject>()
  private readonly text: string

  constructor(readonly bytes: Uint8Array) {
    this.text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
    const header = /(\d+)\s+(\d+)\s+obj\b/g
    let past = 0
    const packed: number[] = []
    for (let match = header.exec(this.text); match !== null; match = header.exec(this.text)) {
      // A match inside a stream already read is its data, not an object.
      if (match.index < past) continue
      const reader = new Reader(bytes)
      reader.at = match.index + match[0].length
      let value: Value
      try {
        value = reader.value()
      } catch {
        continue
      }
      const number = Number(match[1])
      if (reader.peekWord() === 'stream') {
        let start = this.text.indexOf('stream', reader.at) + 'stream'.length
        if (this.text[start] === '\r') start++
        if (this.text[start] === '\n') start++
        this.objects.set(number, { value, stream: start })
        const end = this.streamEnd(value, start)
        past = end
        header.lastIndex = end
        if (isDict(value) && nameOf(value.get('Type')) === 'ObjStm') packed.push(number)
      } else {
        this.objects.set(number, { value })
        header.lastIndex = reader.at
      }
    }
    // Objects packed in object streams, where the file holds no newer one of its own.
    for (const number of packed) this.unpack(number)
  }

  private streamEnd(value: Value, start: number): number {
    const stated = isDict(value) ? value.get('Length') : undefined
    if (typeof stated === 'number' && stated >= 0 && /^\s*endstream/.test(this.text.slice(start + stated, start + stated + 32))) return start + stated
    const end = this.text.indexOf('endstream', start)
    return end < 0 ? this.bytes.length : end
  }

  /** A stream's bytes as stored, before its filters. */
  private raw(object: PdfObject): Uint8Array {
    const start = object.stream!
    const dict = object.value as Dict
    const stated = this.resolve(dict.get('Length'))
    let end: number
    if (typeof stated === 'number' && stated >= 0 && /^\s*endstream/.test(this.text.slice(start + stated, start + stated + 32))) end = start + stated
    else {
      end = this.text.indexOf('endstream', start)
      if (end < 0) end = this.bytes.length
      while (end > start && (this.text[end - 1] === '\n' || this.text[end - 1] === '\r')) end--
    }
    return this.bytes.subarray(start, end)
  }

  private unpack(number: number): void {
    const object = this.objects.get(number)!
    let data: Uint8Array
    try {
      const decoded = this.decoded(object)
      if (decoded.last !== null) return
      data = decoded.bytes
    } catch {
      return
    }
    const dict = object.value as Dict
    const count = this.resolve(dict.get('N'))
    const first = this.resolve(dict.get('First'))
    if (typeof count !== 'number' || typeof first !== 'number') return
    const reader = new Reader(data)
    const pairs: [number, number][] = []
    try {
      for (let i = 0; i < count; i++) pairs.push([reader.value() as number, reader.value() as number])
    } catch {
      return
    }
    for (const [packedNumber, offset] of pairs) {
      if (this.objects.has(packedNumber)) continue
      reader.at = first + offset
      try {
        this.objects.set(packedNumber, { value: reader.value() })
      } catch {
        continue
      }
    }
  }

  resolve(value: Value | undefined, depth = 0): Value | undefined {
    if (!isRef(value)) return value
    if (depth > DEPTH_MAX) return undefined
    return this.resolve(this.objects.get(value.ref)?.value, depth + 1)
  }

  dict(value: Value | undefined): Dict | null {
    const resolved = this.resolve(value)
    return isDict(resolved) ? resolved : null
  }

  /**
   * A stream with its deflating undone: the bytes, and the filter left when one Grid does not
   * undo remains (a JPEG's `DCTDecode` among them), else null.
   */
  decoded(object: PdfObject): { bytes: Uint8Array; last: string | null; parms: Dict | null } {
    const dict = object.value as Dict
    const filterValue = this.resolve(dict.get('Filter'))
    const filters = (Array.isArray(filterValue) ? filterValue : filterValue === undefined ? [] : [filterValue]).map((f) => nameOf(this.resolve(f)) ?? '?')
    const parmsValue = this.resolve(dict.get('DecodeParms'))
    const parmsList = Array.isArray(parmsValue) ? parmsValue.map((p) => this.dict(p)) : [this.dict(parmsValue)]
    let bytes = this.raw(object)
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i]!
      if (filter !== 'FlateDecode' && filter !== 'Fl') return { bytes, last: filters.slice(i).join(' '), parms: parmsList[i] ?? null }
      bytes = inflateSync(bytes, { maxOutputLength: INFLATED_MAX })
      if (i === filters.length - 1) return { bytes, last: null, parms: parmsList[i] ?? null }
    }
    return { bytes, last: null, parms: null }
  }

  /** The pages in order, each with its resources, inherited from the tree above it when it has none. */
  pages(): Dict[] {
    let catalog: Dict | null = null
    for (const object of this.objects.values()) {
      if (isDict(object.value) && nameOf(object.value.get('Type')) === 'Catalog') catalog = object.value
    }
    const pages: Dict[] = []
    const seen = new Set<Dict>()
    const walk = (node: Dict | null, resources: Value | undefined, depth: number): void => {
      if (node === null || seen.has(node) || depth > DEPTH_MAX) return
      seen.add(node)
      const own = node.get('Resources') ?? resources
      const kids = this.resolve(node.get('Kids'))
      if (Array.isArray(kids)) for (const kid of kids) walk(this.dict(kid), own, depth + 1)
      else if (nameOf(node.get('Type')) === 'Page' || node.has('Contents') || node.has('MediaBox')) {
        pages.push(own === undefined || node.has('Resources') ? node : new Map([...node, ['Resources', own]]))
      }
    }
    if (catalog !== null) walk(this.dict(catalog.get('Pages')), undefined, 0)
    return pages
  }

  /** The image objects a page draws, its forms' too, by their number. */
  images(resources: Value | undefined, depth = 0, found = new Set<number>()): Set<number> {
    if (depth > DEPTH_MAX) return found
    const xobjects = this.dict(this.dict(resources)?.get('XObject'))
    for (const value of xobjects?.values() ?? []) {
      if (!isRef(value) || found.has(value.ref)) continue
      const object = this.objects.get(value.ref)
      if (object?.stream === undefined || !isDict(object.value)) continue
      const subtype = nameOf(object.value.get('Subtype'))
      if (subtype === 'Image' && this.resolve(object.value.get('ImageMask')) !== true) found.add(value.ref)
      else if (subtype === 'Form') this.images(object.value.get('Resources'), depth + 1, found)
    }
    return found
  }
}

/** How many colour channels a colour space has, for the ones written out as a PNG; null for any other. */
function channelsOf(file: PdfFile, space: Value | undefined): 1 | 3 | null {
  const resolved = file.resolve(space)
  const name = nameOf(resolved)
  if (name === 'DeviceGray' || name === 'CalGray' || name === 'G') return 1
  if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'RGB') return 3
  if (Array.isArray(resolved)) {
    const family = nameOf(resolved[0])
    if (family === 'CalGray') return 1
    if (family === 'CalRGB') return 3
    if (family === 'ICCBased') {
      const profile = isRef(resolved[1]) ? file.objects.get(resolved[1].ref)?.value : resolved[1]
      const n = isDict(profile) ? file.resolve(profile.get('N')) : undefined
      return n === 1 ? 1 : n === 3 ? 3 : null
    }
  }
  return null
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, tail])
}

/** A PNG of rows already filtered as PNG filters them (one filter byte before each row). */
function pngOf(width: number, height: number, depth: number, channels: 1 | 3, rows: Uint8Array): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = depth
  header[9] = channels === 1 ? 0 : 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array(0))])
}

/** A colour space's name, or its family's, as the file writes it. */
function spaceName(file: PdfFile, space: Value | undefined): string {
  const resolved = file.resolve(space)
  return nameOf(resolved) ?? (Array.isArray(resolved) ? nameOf(file.resolve(resolved[0])) : null) ?? '?'
}

type Converted = { readonly picture: PdfPicture } | { readonly kind: string }

/** One image object as a PNG or a JPEG, or the kind it is stored in when Grid does not read it. */
function pictureOf(file: PdfFile, number: number): Converted {
  const object = file.objects.get(number)!
  const dict = object.value as Dict
  const width = file.resolve(dict.get('Width'))
  const height = file.resolve(dict.get('Height'))
  if (typeof width !== 'number' || typeof height !== 'number' || !(width > 0) || !(height > 0)) return { kind: 'no size' }
  let decoded: ReturnType<PdfFile['decoded']>
  try {
    decoded = file.decoded(object)
  } catch {
    return { kind: 'broken data' }
  }
  if (decoded.last === 'DCTDecode' || decoded.last === 'DCT') return { picture: { kind: 'jpeg', bytes: decoded.bytes, width, height } }
  if (decoded.last !== null) return { kind: decoded.last }
  const channels = channelsOf(file, dict.get('ColorSpace'))
  const depth = file.resolve(dict.get('BitsPerComponent'))
  if (channels === null) return { kind: spaceName(file, dict.get('ColorSpace')) }
  if (typeof depth !== 'number' || !(channels === 1 ? [1, 2, 4, 8] : [8]).includes(depth)) return { kind: `${String(depth)}-bit` }
  const rowBytes = Math.ceil((width * channels * depth) / 8)
  const predictor = file.resolve(decoded.parms?.get('Predictor'))
  let rows: Uint8Array
  if (typeof predictor === 'number' && predictor >= 10) {
    // PNG predictors: the rows are already PNG's, each with its filter byte.
    if (decoded.bytes.length < (rowBytes + 1) * height) return { kind: 'broken data' }
    rows = decoded.bytes.subarray(0, (rowBytes + 1) * height)
  } else if (predictor === undefined || predictor === 1) {
    if (decoded.bytes.length < rowBytes * height) return { kind: 'broken data' }
    rows = new Uint8Array((rowBytes + 1) * height)
    for (let y = 0; y < height; y++) rows.set(decoded.bytes.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1)
  } else return { kind: `Predictor ${String(predictor)}` }
  // A grey image whose Decode runs from 1 to 0 is drawn the other way round, as a PNG cannot say.
  const decode = file.resolve(dict.get('Decode'))
  if (channels === 1 && Array.isArray(decode) && decode[0] === 1 && decode[1] === 0) {
    if (typeof predictor === 'number' && predictor >= 10) return { kind: 'Decode' }
    for (let y = 0; y < height; y++) for (let x = 1; x <= rowBytes; x++) rows[y * (rowBytes + 1) + x] ^= 0xff
  }
  return { picture: { kind: 'png', bytes: pngOf(width, height, depth, channels, rows), width, height } }
}

/** Page `page` (from 1) of a PDF: its largest picture as a PNG or JPEG, or why it has none. */
export function pdfPagePicture(bytes: Uint8Array, page: number): PdfRead {
  if (!isPdf(bytes)) return { problem: 'notPdf', pages: 0 }
  const file = new PdfFile(bytes)
  const pages = file.pages()
  if (pages.length === 0) return { problem: 'notPdf', pages: 0 }
  if (page > pages.length) return { problem: 'noPage', pages: pages.length }
  const images = [...file.images(pages[page - 1]!.get('Resources'))]
  const area = (n: number): number => {
    const dict = file.objects.get(n)!.value as Dict
    const w = file.resolve(dict.get('Width'))
    const h = file.resolve(dict.get('Height'))
    return typeof w === 'number' && typeof h === 'number' ? w * h : 0
  }
  images.sort((a, b) => area(b) - area(a))
  if (images.length === 0) return { problem: 'noPicture', pages: pages.length }
  const converted = pictureOf(file, images[0]!)
  if ('picture' in converted) return { picture: converted.picture, pages: pages.length }
  return { problem: 'pictureKind', pages: pages.length, kind: converted.kind }
}
