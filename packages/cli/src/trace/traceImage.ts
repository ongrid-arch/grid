/**
 * HND-10 (C31): the plan's trace image, read for a picture. The path is the plan's, so it is
 * resolved from the project folder and kept inside it (CMD-15, `loadPlan`), and it must end as a
 * picture does (`traceEndingProblem`). The picture is read through the project's own files, its
 * size taken from its header, and handed to the viewer as a `data:` address: the viewer reads no
 * file and fetches nothing. Whatever stops it being drawn is said, never refused: a plan may name
 * its trace image before the picture is in the folder, or one that is not Grid's to read.
 */
import { tracePlacement, traceFloor, type FloorPlan } from '@ongrid/floorplan/geometry'
import { name, said, say, type Language, type Values } from '@ongrid/floorplan/messages'
import type { TracePicture } from '@ongrid/viewer/src/picture'
import { PathRefused, type Project } from '../fs/projectFiles'

/** The endings a trace image may have: the pictures every viewer and Skia draw. */
export const TRACE_ENDINGS = ['.png', '.jpg', '.jpeg'] as const

/** The largest trace image Grid reads, in bytes: a phone's photo or a scanned sheet is far less. */
export const TRACE_MAX_BYTES = 32 * 1024 * 1024

/** The most pixels a trace image may have along either side. */
export const TRACE_MAX_SIDE = 16_384

/** Whether a trace image's path ends as a picture does, in any capitals. */
export function hasPictureEnding(path: string): boolean {
  const lower = path.toLowerCase()
  return TRACE_ENDINGS.some((ending) => lower.endsWith(ending))
}

export type PictureKind = 'png' | 'jpeg'

/** A picture's kind and size in pixels from its first bytes, or null for anything that is not a PNG or a JPEG. */
export function pictureHeader(bytes: Uint8Array): { kind: PictureKind; width: number; height: number } | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= 24 && png.every((b, i) => bytes[i] === b)) {
    // The first chunk is IHDR: its width and height, four bytes each, high byte first.
    if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null
    return sized('png', u32(bytes, 16), u32(bytes, 20))
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes)
  return null
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
}

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) + bytes[at + 1]!
}

function sized(kind: PictureKind, width: number, height: number): { kind: PictureKind; width: number; height: number } | null {
  return width > 0 && height > 0 ? { kind, width, height } : null
}

/**
 * A JPEG's size as it is shown: from its first frame header, segment by segment after the start
 * marker, turned a quarter when its EXIF orientation says so (5 to 8), as Skia and browsers turn it.
 * A phone's photo is stored as the sensor saw it and shown turned; its pixels are counted shown.
 */
function jpegSize(bytes: Uint8Array): { kind: PictureKind; width: number; height: number } | null {
  let at = 2
  let turned = false
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]!
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1
      continue
    }
    // Markers that stand alone, with no length after them.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = u16(bytes, at + 2)
    if (length < 2) return null
    // A frame header (SOF0 to SOF15, not DHT, JPG or DAC): precision, height, width.
    if (marker === 0xe1) turned = turned || quarterTurned(bytes.subarray(at + 4, at + 2 + length))
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > bytes.length) return null
      const width = u16(bytes, at + 7)
      const height = u16(bytes, at + 5)
      return turned ? sized('jpeg', height, width) : sized('jpeg', width, height)
    }
    at += 2 + length
  }
  return null
}

/** Whether an APP1 segment's EXIF says the picture is shown a quarter turned: orientation 5 to 8. */
function quarterTurned(segment: Uint8Array): boolean {
  if (segment.length < 14 || String.fromCharCode(...segment.subarray(0, 6)) !== 'Exif\0\0') return false
  const tiff = segment.subarray(6)
  const little = tiff[0] === 0x49 && tiff[1] === 0x49
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return false
  const read16 = (at: number): number => (little ? tiff[at]! + (tiff[at + 1]! << 8) : u16(tiff, at))
  const read32 = (at: number): number => (little ? read16(at) + read16(at + 2) * 0x10000 : u32(tiff, at))
  const ifd = read32(4)
  if (ifd + 2 > tiff.length) return false
  const entries = read16(ifd)
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > tiff.length) return false
    // Orientation, a SHORT whose value sits in the entry's first two value bytes.
    if (read16(entry) === 0x0112) return read16(entry + 8) >= 5 && read16(entry + 8) <= 8
  }
  return false
}

/** The trace image read for the floor drawn: the picture to draw, if it can be drawn, and what to say about it. */
export interface TraceRead {
  readonly picture: TracePicture | null
  /** One sentence on the trace image for this floor; null when the plan names none, or it lies under another floor and nothing is to be said. */
  readonly line: string | null
}

const NONE: TraceRead = { picture: null, line: null }

/** A number as the lines write it: to four significant figures, with no trailing zeros. */
function figure(n: number): { num: string } {
  return { num: String(Number(n.toPrecision(4))) }
}

/**
 * The plan's trace image for a picture of `floor`, read from the project folder. A path that
 * leads out of the folder or does not end as a picture is never read (MSG-20: `loadPlan` reads the
 * plan without it, and says so), and the line says why it is not drawn.
 */
export function readTrace(project: Project, plan: FloorPlan, floor: string, language: Language = 'en'): TraceRead {
  const image = plan.referenceImage
  if (image === undefined) return NONE
  const path = name(image.path)
  const on = traceFloor(plan)
  if (!on.known) return { picture: null, line: say(language, 'trace.unknownFloor', { path, floor: name(on.floor) }) }
  if (on.floor !== floor) return { picture: null, line: say(language, 'trace.otherFloor', { path, floor: name(on.floor) }) }
  // MSG-20: a path out of the project folder, or one that is no picture by its ending, is never read.
  let real: string
  try {
    real = project.resolve(image.path, 'project')
  } catch (error) {
    if (!(error instanceof PathRefused)) throw error
    return { picture: null, line: say(language, 'trace.refused', { path, detail: error.message.replace(/\s+/g, ' ').trim() }) }
  }
  if (!hasPictureEnding(image.path)) return { picture: null, line: say(language, 'trace.notPictureEnding', { path }) }
  let bytes: Uint8Array
  try {
    bytes = project.readBytes(real, TRACE_MAX_BYTES)
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (code === 'EFBIG') return { picture: null, line: say(language, 'trace.tooLarge', { path, megabytes: TRACE_MAX_BYTES / 1024 / 1024 }) }
    if (code === 'ENOENT' || code === 'EISDIR') return { picture: null, line: say(language, 'trace.missing', { path }) }
    throw error
  }
  const header = pictureHeader(bytes)
  if (header === null) return { picture: null, line: say(language, 'trace.notPicture', { path }) }
  if (header.width > TRACE_MAX_SIDE || header.height > TRACE_MAX_SIDE) {
    return { picture: null, line: say(language, 'trace.tooManyPixels', { path, width: header.width, height: header.height, most: TRACE_MAX_SIDE }) }
  }
  const picture: TracePicture = {
    href: `data:image/${header.kind};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`,
    width: header.width,
    height: header.height,
  }
  const placement = tracePlacement(plan, picture)!
  const scale = placement.scale
  const metres = figure(scale.metresPerPixel)
  const values: Values = {
    path,
    width: header.width,
    height: header.height,
    x: figure(placement.at.x),
    y: figure(placement.at.y),
    metres,
    scale: scale.from === 'calibration'
      ? said('trace.scale.calibration', { metres, pixels: figure(scale.pixels!), length: figure(scale.length!) })
      : said(scale.from === 'scale' ? 'trace.scale.stated' : 'trace.scale.none', { metres }),
    degrees: figure(placement.rotation),
  }
  return { picture, line: say(language, placement.rotation === 0 ? 'trace.drawn' : 'trace.drawnTurned', values) }
}
