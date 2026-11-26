import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { deflateSync, inflateSync } from 'zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { loadCanvas } from '../../draw/canvas'
import { loadPlan } from '../../command/plan'
import { openProject } from '../../fs/projectFiles'
import { pdfPagePicture } from '../pdfImage'
import { pictureHeader, readTrace } from '../traceImage'

/**
 * VEW-67: a page of a PDF as the trace image: the largest picture on it, a scanned sheet's scan,
 * as a JPEG handed on or deflated pixels written out as a PNG; a page of lines alone says so.
 */

const sample = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as Record<string, unknown>
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

type Body = string | { readonly dict: string; readonly data: Uint8Array } | null

/** A PDF of the objects given, numbered from 1, object 1 its catalog, a null a number left free; offsets written as a real one's are. */
function pdf(objects: readonly Body[]): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets: number[] = []
  let at = parts[0]!.length
  objects.forEach((body, i) => {
    offsets.push(body === null ? -1 : at)
    if (body === null) return
    const piece = typeof body === 'string'
      ? Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1')
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${body.dict.replace('LENGTH', String(body.data.length))}\nstream\n`, 'latin1'), Buffer.from(body.data), Buffer.from('\nendstream\nendobj\n', 'latin1')])
    parts.push(piece)
    at += piece.length
  })
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => (o < 0 ? '0000000000 65535 f \n' : `${String(o).padStart(10, '0')} 00000 n \n`)).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return Buffer.concat([...parts, Buffer.from(xref, 'latin1')])
}

async function jpeg(width: number, height: number): Promise<Buffer> {
  const { createCanvas } = await loadCanvas()
  const canvas = createCanvas(width, height)
  canvas.getContext('2d').fillRect(0, 0, width, height)
  return canvas.toBuffer('image/jpeg')
}

/** The rows of a PNG Grid wrote, inflated, each with its filter byte. */
function pngRows(bytes: Uint8Array): Buffer {
  const b = Buffer.from(bytes)
  const chunks: Buffer[] = []
  for (let at = 8; at < b.length;) {
    const length = b.readUInt32BE(at)
    if (b.toString('latin1', at + 4, at + 8) === 'IDAT') chunks.push(b.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  return inflateSync(Buffer.concat(chunks))
}

describe('a PDF page\'s picture', () => {
  it('hands on a scanned page\'s JPEG as it is, the largest picture on the page, in page order', async () => {
    const scan = await jpeg(40, 30)
    const small = await jpeg(4, 3)
    const file = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /XObject << /Im1 6 0 R >> >> >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Logo 6 0 R /Scan 7 0 R >> >> /Contents 5 0 R >>',
      { dict: '<< /Length LENGTH >>', data: Buffer.from('q 595 0 0 842 0 0 cm /Scan Do Q') },
      { dict: '<< /Type /XObject /Subtype /Image /Width 4 /Height 3 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length LENGTH >>', data: small },
      { dict: '<< /Type /XObject /Subtype /Image /Width 40 /Height 30 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/DCTDecode] /Length LENGTH >>', data: scan },
    ])
    // Page 1 takes its resources from the tree above it.
    const first = pdfPagePicture(file, 1)
    expect(first).toMatchObject({ pages: 2, picture: { kind: 'jpeg', width: 4, height: 3 } })
    const second = pdfPagePicture(file, 2)
    expect(second).toMatchObject({ pages: 2, picture: { kind: 'jpeg', width: 40, height: 30 } })
    expect(Buffer.from((second as { picture: { bytes: Uint8Array } }).picture.bytes).equals(scan)).toBe(true)
    expect(pdfPagePicture(file, 3)).toEqual({ problem: 'noPage', pages: 2 })
  })

  it('writes deflated grey and RGB pixels out as a PNG, also from an object stream and a form', () => {
    const rgb = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90])
    // Objects 3 (the page) and 4 (the page tree) are packed in object 2, whose length is object 7.
    const pageDict = '<< /Type /Page /Parent 4 0 R /Resources << /XObject << /F 5 0 R >> >> >>'
    const pagesDict = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
    const head = `3 0 4 ${pageDict.length + 1} `
    const packed = deflateSync(Buffer.from(`${head}${pageDict} ${pagesDict}`, 'latin1'))
    const file = pdf([
      '<< /Type /Catalog /Pages 4 0 R >>',
      { dict: `<< /Type /ObjStm /N 2 /First ${head.length} /Filter /FlateDecode /Length 7 0 R >>`, data: packed },
      null,
      null,
      { dict: '<< /Type /XObject /Subtype /Form /Resources << /XObject << /Im 6 0 R >> >> /Length LENGTH >>', data: Buffer.from('/Im Do') },
      { dict: '<< /Type /XObject /Subtype /Image /Width 3 /Height 2 /ColorSpace [/ICCBased 8 0 R] /BitsPerComponent 8 /Filter /FlateDecode /Length LENGTH >>', data: deflateSync(rgb) },
      String(packed.length),
      { dict: '<< /N 3 /Length LENGTH >>', data: Buffer.from('profile') },
    ])
    const read = pdfPagePicture(file, 1)
    expect(read).toMatchObject({ pages: 1, picture: { kind: 'png', width: 3, height: 2 } })
    const png = (read as { picture: { bytes: Uint8Array } }).picture.bytes
    expect(pictureHeader(png)).toEqual({ kind: 'png', width: 3, height: 2 })
    expect([...pngRows(png)]).toEqual([0, ...rgb.subarray(0, 9), 0, ...rgb.subarray(9)])

    // One-bit grey, its Decode reversed, comes out the other way round.
    const grey = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im 4 0 R >> >> >>',
      { dict: '<< /Subtype /Image /Width 8 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 1 /Decode [1 0] /Filter /FlateDecode /Length LENGTH >>', data: deflateSync(Buffer.from([0b10100000])) },
    ])
    const one = pdfPagePicture(grey, 1) as { picture: { bytes: Uint8Array } }
    expect([...pngRows(one.picture.bytes)]).toEqual([0, 0b01011111])
  })

  it('says a page of lines has no picture, a kind it does not read, and a file that is no PDF', () => {
    const lines = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /Mask 5 0 R >> >> >>',
      { dict: '<< /Length LENGTH >>', data: Buffer.from('0 0 m 100 100 l S') },
      { dict: '<< /Subtype /Image /ImageMask true /Width 2 /Height 2 /Length LENGTH >>', data: Buffer.from([0, 0]) },
    ])
    expect(pdfPagePicture(lines, 1)).toEqual({ problem: 'noPicture', pages: 1 })
    const fax = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im 4 0 R >> >> >>',
      { dict: '<< /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /Length LENGTH >>', data: Buffer.from([1, 2, 3]) },
    ])
    expect(pdfPagePicture(fax, 1)).toEqual({ problem: 'pictureKind', pages: 1, kind: 'CCITTFaxDecode' })
    expect(pdfPagePicture(Buffer.from('not a pdf'), 1)).toEqual({ problem: 'notPdf', pages: 0 })
    expect(pdfPagePicture(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog\n'), 1)).toEqual({ problem: 'notPdf', pages: 0 })
  })
})

describe('a PDF as the plan\'s trace image', () => {
  function project(image: Record<string, unknown>, files: Record<string, Uint8Array>) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'grid-trace-pdf-')))
    made.push(dir)
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data)
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...sample, referenceImage: image }))
    return openProject(dir, dir)
  }

  it('is drawn from the page named, and says which page and why not', async () => {
    const scan = await jpeg(400, 300)
    const sheet = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Scan 6 0 R >> >> >>',
      { dict: '<< /Length LENGTH >>', data: Buffer.from('0 0 m 1 1 l S') },
      { dict: '<< /Subtype /Image /Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length LENGTH >>', data: scan },
    ])
    const p = project({ path: 'sheet.pdf', page: 2, scale: 0.02 }, { 'sheet.pdf': sheet })
    const loaded = loadPlan(p, 'plan.json')
    expect(loaded.trace).toBeUndefined()
    const drawn = readTrace(p, loaded.plan, 'ground')
    expect(drawn.picture).toMatchObject({ width: 400, height: 300 })
    expect(drawn.picture!.href.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(drawn.line).toContain('"sheet.pdf" page 2, 400 × 300 px, is drawn under the plan, 1 px = 0.02 m')

    const first = readTrace(p, { ...loaded.plan, referenceImage: { ...loaded.plan.referenceImage!, page: 1 } }, 'ground')
    expect(first.picture).toBeNull()
    expect(first.line).toContain('Page 1 of the trace image "sheet.pdf" holds no scanned picture')
    const past = readTrace(p, { ...loaded.plan, referenceImage: { ...loaded.plan.referenceImage!, page: 5 } }, 'ground')
    expect(past.line).toBe('The trace image "sheet.pdf" has 2 pages, so it has no page 5 to draw.')
  })
})
