/**
 * MSG-3, VEW-17: the label "General guidance, not your local rules" on a picture Grid draws
 * straight onto a canvas (a 3D still, a view from inside a room, plans side by side). It is
 * written in a caption band under the drawing, never over it, and also in the PNG's own metadata.
 * A 2D plan carries its caption in its SVG (`pictureToSvg`), so only its metadata is added here.
 */
import { crc32 } from 'zlib'
import type { Canvas, SKRSContext2D } from '@napi-rs/canvas'
import { DEFAULT_LANGUAGE, say, type Language } from '@ongrid/floorplan/messages'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

/** The colours of the band and its text; the working look's by default. */
export interface StampColours {
  readonly paper: string
  readonly ink: string
}

const WORKING: StampColours = { paper: '#ffffff', ink: '#75726a' }

/** The label in `language` (MSG-11). */
export function labelText(language: Language = DEFAULT_LANGUAGE): string {
  return language === DEFAULT_LANGUAGE ? GENERAL_GUIDANCE_LABEL : say(language, 'label')
}

/** The text size of the caption, following the picture's width. */
const captionPx = (width: number): number => Math.max(11, Math.round(width / 110))

/** The height in pixels of the caption band under a picture `width` pixels wide. */
export function captionHeight(width: number): number {
  return Math.round(captionPx(width) * 2.2)
}

/**
 * A new canvas as wide as `source` and a caption band taller: the picture untouched on top, the
 * label written in the band under it, in `language`.
 */
export function captioned(
  createCanvas: (width: number, height: number) => Canvas,
  source: Canvas,
  colours: StampColours = WORKING,
  language: Language = DEFAULT_LANGUAGE
): Canvas {
  const px = captionPx(source.width)
  const band = captionHeight(source.width)
  const canvas = createCanvas(source.width, source.height + band)
  const context: SKRSContext2D = canvas.getContext('2d')
  context.fillStyle = colours.paper
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)
  context.font = `${px}px sans-serif`
  context.fillStyle = colours.ink
  context.fillText(labelText(language), px, source.height + Math.round(px * 1.45))
  return canvas
}

const PNG_SIGNATURE = 8

/**
 * The PNG with its label in a `Description` text chunk, so a picture cropped of its caption still
 * says what it is. The chunk goes right after the header; the picture's pixels are not touched.
 */
export function withLabelMetadata(png: Uint8Array, language: Language = DEFAULT_LANGUAGE): Uint8Array {
  const headerEnd = PNG_SIGNATURE + 8 + 13 + 4
  const keyword = Buffer.from('Description', 'latin1')
  // A text chunk is Latin-1; the international one (`iTXt`) holds the label in any language as UTF-8.
  const data = Buffer.concat([keyword, Buffer.from([0, 0, 0, 0, 0]), Buffer.from(labelText(language), 'utf8')])
  const type = Buffer.from('iTXt', 'latin1')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])))
  const chunk = Buffer.concat([length, type, data, crc])
  return Buffer.concat([png.subarray(0, headerEnd), chunk, png.subarray(headerEnd)])
}

/** The text a PNG's `Description` chunk holds, or null when it has none (for tests and readers). */
export function readLabelMetadata(png: Uint8Array): string | null {
  const bytes = Buffer.from(png)
  let at = PNG_SIGNATURE
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'iTXt') {
      const body = bytes.subarray(at + 8, at + 8 + size)
      const zero = body.indexOf(0)
      if (body.toString('latin1', 0, zero) === 'Description') return body.subarray(zero + 5).toString('utf8')
    }
    at += 12 + size
  }
  return null
}

