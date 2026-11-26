import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { loadCanvas } from '../../draw/canvas'
import { drawFile } from '../../command/draw'
import { checkPlan } from '../../command/check'
import { loadPlan } from '../../command/plan'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { hasPictureEnding, pictureHeader, readTrace, TRACE_MAX_SIDE } from '../traceImage'

/**
 * HND-10 (C31): the plan's trace image, read from the project folder and drawn under the plan in
 * the pictures an agent gets; a path that is not a picture inside the folder is never read, and
 * the plan is read without it, with one line (MSG-20).
 */

const sample = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as Record<string, unknown>
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

/** A picture of `width` × `height` pixels, drawn by Skia, as PNG or JPEG bytes. */
async function picture(width: number, height: number, mime: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Buffer> {
  const { createCanvas } = await loadCanvas()
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#cc0000'
  context.fillRect(0, 0, width, height)
  return mime === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg')
}

/** A project holding the sample plan with `image` as its trace image, and `files` beside it. */
function project(image: Record<string, unknown> | null, files: Record<string, Uint8Array | string> = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'grid-trace-')))
  made.push(dir)
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), data)
  }
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(image === null ? sample : { ...sample, referenceImage: image }))
  return { dir, project: openProject(dir, dir) }
}

function plan(image: Record<string, unknown>, extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({ ...sample, ...extra, referenceImage: image })
}

describe('a picture\'s kind and size, from its header', () => {
  it('reads a PNG and a JPEG, and nothing else', async () => {
    expect(pictureHeader(await picture(320, 200))).toEqual({ kind: 'png', width: 320, height: 200 })
    expect(pictureHeader(await picture(321, 199, 'image/jpeg'))).toEqual({ kind: 'jpeg', width: 321, height: 199 })
    for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '#!/bin/sh\necho hi\n', 'GIF89a', '']) {
      expect(pictureHeader(new TextEncoder().encode(text)), text).toBeNull()
    }
    // A PNG's signature with no header after it, and a JPEG cut off before its frame.
    expect(pictureHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull()
    expect(pictureHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBeNull()
  })

  it('counts a phone photo\'s pixels as it is shown, turned by its EXIF orientation as Skia turns it', async () => {
    const jpeg = await picture(40, 20, 'image/jpeg')
    for (const [order, orientation, size] of [['MM', 6, [20, 40]], ['II', 8, [20, 40]], ['MM', 3, [40, 20]], ['II', 1, [40, 20]]] as const) {
      const big = order === 'MM'
      const short = (n: number): number[] => (big ? [n >> 8, n & 255] : [n & 255, n >> 8])
      const long = (n: number): number[] => (big ? [0, 0, 0, n] : [n, 0, 0, 0])
      // A TIFF header and one IFD entry: Orientation (0x0112), a SHORT.
      const tiff = [...(big ? [0x4d, 0x4d, 0, 0x2a] : [0x49, 0x49, 0x2a, 0]), ...long(8), ...short(1), ...short(0x0112), ...short(3), ...long(1), ...short(orientation), 0, 0, ...long(0)]
      const body = [...Buffer.from('Exif\0\0', 'latin1'), ...tiff]
      const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]
      const bytes = new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)])
      expect(pictureHeader(bytes), `${order} ${orientation}`).toEqual({ kind: 'jpeg', width: size[0], height: size[1] })
      // And Skia agrees.
      const { loadImage } = await loadCanvas()
      const shown = await loadImage(Buffer.from(bytes))
      expect([shown.width, shown.height]).toEqual(size)
    }
  })

  it('knows a picture by its ending, in any capitals', () => {
    expect(['a.png', 'b.JPG', 'scans/c.jpeg', 'sheets/d.PDF'].every(hasPictureEnding)).toBe(true)
    expect(['a.svg', 'b.png.js', 'c.txt', 'd', 'e.pdf.js', 'f.heic'].some(hasPictureEnding)).toBe(false)
  })
})

describe('the trace image read for a picture', () => {
  it('is drawn when it is a picture in the folder, with its scale said', async () => {
    const { project: p } = project(null, { 'assets/scan.png': await picture(800, 600) })
    const read = readTrace(p, plan({ path: 'assets/scan.png', at: [-1, 9], calibration: { from: [100, 100], to: [700, 100], length: 10 } }), 'ground')
    expect(read.picture).toMatchObject({ width: 800, height: 600 })
    expect(read.picture!.href.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true)
    expect(read.line).toBe('The trace image "assets/scan.png", 800 × 600 px, is drawn under the plan, 1 px = 0.01667 m, set from two points on it 600 px apart that are 10 m apart on the building. Its top-left corner is at (-1, 9) m, and its pixel (u, v) lies at x = -1 + 0.01667·u, y = 9 − 0.01667·v.')
  })

  it('says it is unscaled, turned, or in Spanish', async () => {
    const { project: p } = project(null, { 'photo.jpg': await picture(40, 30, 'image/jpeg') })
    expect(readTrace(p, plan({ path: 'photo.jpg' }), 'ground').line).toContain('with no scale yet, so at 1 px = 0.01 m')
    expect(readTrace(p, plan({ path: 'photo.jpg', scale: 0.05, rotation: 90 }), 'ground').line).toBe('The trace image "photo.jpg", 40 × 30 px, is drawn under the plan, 1 px = 0.05 m, the scale the plan states, turned 90° counter-clockwise about its top-left corner at (0, 0) m.')
    expect(readTrace(p, plan({ path: 'photo.jpg', scale: 0.025 }), 'ground', 'es').line).toContain('1 px = 0,025 m')
  })

  it('is not drawn, and says why, when it is missing, not a picture, too large or on no floor of the plan', async () => {
    const { project: p } = project(null, { 'fake.png': '#!/bin/sh\n', 'folder.png/x': 'x' })
    expect(readTrace(p, plan({ path: 'assets/later.png' }), 'ground')).toEqual({ picture: null, line: 'The trace image "assets/later.png" is not in the project folder yet, so it is not drawn.' })
    expect(readTrace(p, plan({ path: 'folder.png' }), 'ground').line).toContain('is not in the project folder yet')
    expect(readTrace(p, plan({ path: 'fake.png' }), 'ground')).toEqual({ picture: null, line: 'The trace image "fake.png" is not a PNG or a JPEG picture, so it is not drawn.' })
    const floors = { floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }] }
    expect(readTrace(p, plan({ path: 'fake.png', floor: 'attic' }, floors), 'ground').line).toBe('The trace image "fake.png" lies under floor "attic", which the plan does not have, so it is not drawn.')
    expect(readTrace(p, plan({ path: 'fake.png', floor: 'first' }, floors), 'ground').line).toBe('The trace image "fake.png" lies under floor "first", so it is not drawn on this one.')
  })

  it('is not drawn when it has more pixels along a side than Grid draws', async () => {
    // A PNG header alone says the size; the picture is never decoded.
    const header = Buffer.from(await picture(4, 4))
    header.writeUInt32BE(TRACE_MAX_SIDE + 1, 16)
    const { project: p } = project(null, { 'huge.png': header })
    expect(readTrace(p, plan({ path: 'huge.png' }), 'ground').line).toBe(`The trace image "huge.png" is 16385 × 4 px, more than ${TRACE_MAX_SIDE} px along a side, so it is not drawn.`)
  })

  it('says nothing for a plan with none', () => {
    const { project: p } = project(null)
    expect(readTrace(p, parseFloorPlan(sample), 'ground')).toEqual({ picture: null, line: null })
  })
})

describe('the picture an agent gets back, and grid draw', () => {
  it('draws the trace image under the plan in grid_view, and says where it lies', async () => {
    const image = { path: 'assets/scan.png', at: [-1, 9], scale: 0.02 }
    const traced = project(image, { 'assets/scan.png': await picture(600, 500) })
    const plain = project(null)
    const view = GRID_TOOLS.find((tool) => tool.name === 'grid_view')!
    const answer = await view.run({ plan: 'plan.json', kind: 'plan' }, { project: traced.project })
    const without = await view.run({ plan: 'plan.json', kind: 'plan' }, { project: plain.project })
    expect(answer.text).toContain('The trace image "assets/scan.png", 600 × 500 px, is drawn under the plan, 1 px = 0.02 m, the scale the plan states.')
    expect(without.text).not.toContain('trace image')
    expect(Buffer.from(answer.image!.data).equals(Buffer.from(without.image!.data))).toBe(false)
  })

  it('writes it into grid draw\'s SVG, with the line for standard error', async () => {
    const traced = project({ path: 'scan.jpg', scale: 0.02 }, { 'scan.jpg': await picture(60, 50, 'image/jpeg') })
    const loaded = loadPlan(traced.project, 'plan.json')
    const drawn = await drawFile(loaded, { png: false } as never, 1, 'working', traced.project)
    expect(drawn.file).toContain('<image data-part="trace-image" href="data:image/jpeg;base64,')
    expect(drawn.traceNote).toContain('The trace image "scan.jpg", 60 × 50 px, is drawn under the plan')
    // Without the project, as a library caller draws, there is no trace image.
    const alone = await drawFile(loaded, { png: false } as never, 1, 'working')
    expect(alone.file).not.toContain('trace-image')
  })
})

describe('the six T-5 cases a plan from someone else may name (HND-10)', () => {
  const cases: ReadonlyArray<readonly [what: string, path: string, why: string]> = [
    ['another folder', '../other-project/scan.png', 'outside the project folder'],
    ['..', '../scan.png', 'outside the project folder'],
    ['a web address', 'https://example.invalid/scan.png', 'an address (https:)'],
    ['a script', 'javascript:alert(1)', 'an address (javascript:)'],
    ['an absolute path', '/etc/scan.png', 'outside the project folder'],
    ['an ending that is not a picture', 'assets/run.sh', 'does not end in .png, .jpg, .jpeg or .pdf'],
  ]

  // MSG-20: the plan is read without it, in one line, and the file is never read.
  it.each(cases)('leaves out %s, and says why: %j', (_, path, why) => {
    const { dir, project: p } = project({ path })
    const loaded = loadPlan(p, 'plan.json')
    expect(loaded.plan.rooms.length).toBeGreaterThan(0)
    expect(loaded.trace).toMatchObject({ path })
    const lines = checkPlan(loaded, {}).result.lines.filter((line) => line.code === 'plan/trace-left-out')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'left-out', thing: { kind: 'plan', id: '' } })
    expect(lines[0]!.message).toContain(JSON.stringify(path))
    expect(lines[0]!.message).toContain(why)
    // A refusal never says where the project folder is on the disk.
    expect(lines[0]!.message).not.toContain(dir)
    const drawn = readTrace(p, loaded.plan, 'ground')
    expect(drawn.picture).toBeNull()
    expect(drawn.line).toContain(why)
  })

  it('says a picture that is not there yet in the check too, once', () => {
    const { project: p } = project({ path: 'assets/later.png' })
    const loaded = loadPlan(p, 'plan.json')
    expect(loaded.trace).toEqual({ path: 'assets/later.png', why: 'missing' })
    const lines = checkPlan(loaded, {}).result.lines.filter((line) => line.code === 'plan/trace-left-out')
    expect(lines.map((line) => line.message)).toEqual(['The plan\'s trace image is left out of every view: "assets/later.png" is not in the project folder yet'])
    expect(lines[0]!.found).toBe('the plan is read without it')
  })

  it('keeps the trace image as written when the plan is read whole to be written back', () => {
    const { project: p } = project({ path: '../scan.png', opacity: 0.3 })
    const loaded = loadPlan(p, 'plan.json', { whole: true })
    expect(loaded.plan.referenceImage).toMatchObject({ path: '../scan.png', opacity: 0.3 })
    expect(loaded.trace?.why).toBe('refused')
  })

  it('says nothing in the check for a picture that is there', async () => {
    const { project: p } = project({ path: 'scan.png' }, { 'scan.png': await picture(4, 4) })
    const loaded = loadPlan(p, 'plan.json')
    expect(loaded.trace).toBeUndefined()
    expect(checkPlan(loaded, {}).result.lines.map((line) => line.code)).not.toContain('plan/trace-left-out')
  })

  it('leaves out a picture\'s ending on a script or a page too, in any capitals', () => {
    for (const path of ['scan.svg', 'scan.png.js', 'scan.html', 'scan.PNG.exe']) {
      const { project: p } = project({ path }, { [path]: 'not a picture' })
      const loaded = loadPlan(p, 'plan.json')
      expect(loaded.trace, path).toEqual({ path, why: 'ending' })
      expect(readTrace(p, loaded.plan, 'ground').line, path).toBe(`The trace image ${JSON.stringify(path)} does not end in .png, .jpg, .jpeg or .pdf, so it is not drawn.`)
    }
    const { project: p } = project({ path: 'Scans/Ground.JPEG' })
    expect(loadPlan(p, 'plan.json').trace?.why).toBe('missing')
  })
})
