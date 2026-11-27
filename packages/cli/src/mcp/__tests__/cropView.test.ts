import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { drawPlan } from '../../draw/drawPlan'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'
import { readArgs } from '../toolkit'

/**
 * VEW-6: every plan picture comes with each part's box in image pixels, and can be cropped to
 * one part by id or zoomed onto a room by its name.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function context() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-crop-view-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return { project: openProject(dir, dir) }
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!

interface Box { id: string; kind: string; box: { x: number; y: number; width: number; height: number } }

const inside = (b: Box['box'], x: number, y: number): boolean => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height

/** Where the SVG draws each opening's id and each room's label, in its own pixels. */
async function drawnCentres(frame?: unknown): Promise<{ width: number; points: Map<string, { x: number; y: number }> }> {
  const svg = await drawPlan(JSON.parse(readFileSync(sample, 'utf8')), { format: 'svg', labels: { ids: true }, ...(frame ? { frame } : {}) } as never)
  const [vx, vy, vw] = /<svg x="0" y="0"[^>]* viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+)/.exec(svg)!.slice(1).map(Number) as [number, number, number]
  const width = Number(/<svg[^>]* width="(\d+)"/.exec(svg)![1])
  const scale = width / vw
  const points = new Map<string, { x: number; y: number }>()
  for (const m of svg.matchAll(/data-part="opening-id" data-opening="([^"]+)" transform="translate\(([-\d.e]+) ([-\d.e]+)\)/g)) {
    points.set(m[1]!, { x: (Number(m[2]) - vx) * scale, y: (Number(m[3]) - vy) * scale })
  }
  return { width, points }
}

describe('boxes on the picture', () => {
  it('come with every plan picture, one for every room, opening and wall, each holding the part\'s drawn centre', async () => {
    const answer = await view.run({ plan: 'plan.json', kind: 'plan' }, context())
    const boxes = (answer.data as { boxes: Box[] }).boxes
    const plan = JSON.parse(readFileSync(sample, 'utf8')) as { rooms: { id: string }[]; openings: { id: string }[]; walls: { id: string }[] }
    expect(new Set(boxes.map((b) => b.id))).toEqual(new Set([...plan.rooms, ...plan.openings, ...plan.walls].map((p) => p.id)))
    const { points } = await drawnCentres()
    expect(points.size).toBe(plan.openings.length)
    // An opening's id is drawn on its wall's face, at the middle of the opening.
    for (const [id, at] of points) {
      const box = boxes.find((b) => b.id === id)!.box
      expect(inside({ x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 }, at.x, at.y), id).toBe(true)
    }
    expect(answer.text).toContain('is in boxes')
  })

  it('crops to one part by id, and zooms onto a room by its name', async () => {
    const whole = await view.run({ plan: 'plan.json', kind: 'plan' }, context())
    const byId = await view.run({ plan: 'plan.json', kind: 'plan', crop: 'front' }, context())
    const byName = await view.run({ plan: 'plan.json', kind: 'plan', crop: 'kitchen' }, context())
    const byRoomName = await view.run({ plan: 'plan.json', kind: 'plan', crop: 'Living room' }, context())
    for (const [answer, id] of [[byId, 'front'], [byName, 'kitchen'], [byRoomName, 'lounge']] as const) {
      const data = answer.data as { pxPerMetre: number; boxes: Box[] }
      expect(data.pxPerMetre).toBeGreaterThan((whole.data as { pxPerMetre: number }).pxPerMetre)
      const box = data.boxes.find((b) => b.id === id)!.box
      // The part sits in the middle of the picture, 1200 px wide.
      expect(Math.abs(box.x + box.width / 2 - 600)).toBeLessThan(60)
      expect(answer.text).toContain(`cropped to`)
    }
    expect(byRoomName.text).toContain('cropped to room "lounge"')
  })

  it('refuses a crop that names nothing on the floor, naming the rooms', async () => {
    await expect(view.run({ plan: 'plan.json', kind: 'plan', crop: 'attic' }, context())).rejects.toThrow(/Its nearest rooms: .*"bed2" \("Bedroom 2"\)/)
    await expect(view.run({ plan: 'plan.json', kind: '3d', crop: 'kitchen' }, context())).rejects.toThrow(/not crop/)
  })
})

/** VEW-74: the flat with a flat, a household fact and a plan of two floors, written into a project. */
function contextWith(edit: (plan: Record<string, unknown>) => void, file = sample) {
  const dir = mkdtempSync(join(tmpdir(), 'grid-crop-many-'))
  made.push(dir)
  const plan = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  edit(plan)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
  return { project: openProject(dir, dir) }
}

const withFlatAndHousehold = (plan: Record<string, unknown>): void => {
  plan['flats'] = [{ id: 'flat-a', name: 'Left flat', rooms: ['bed2', 'bath'] }]
  for (const room of plan['rooms'] as { id: string; properties?: Record<string, string> }[]) {
    if (room.id === 'bed1' || room.id === 'bed2') room.properties = { household: 'Rose' }
  }
}

const call = async (raw: Record<string, unknown>, ctx = contextWith(withFlatAndHousehold)) => view.run(readArgs(view, { plan: 'plan.json', kind: 'plan', ...raw }), ctx)
const px = (answer: { data: Record<string, unknown> }): number => answer.data['pxPerMetre'] as number
const boxOf = (answer: { data: Record<string, unknown> }, id: string) => (answer.data['boxes'] as Box[]).find((b) => b.id === id)?.box

describe('a crop of several parts, a flat, a condition or a box (VEW-74)', () => {
  it('frames several parts named together, wider than either alone, each whole in the picture', async () => {
    const kitchen = await call({ crop: 'kitchen' })
    const both = await call({ crop: 'kitchen, Bedroom 1' })
    expect(both.text).toContain('cropped to 2 parts together: room "kitchen", room "bed1"')
    expect(px(both)).toBeLessThan(px(kitchen))
    for (const id of ['kitchen', 'bed1']) {
      const box = boxOf(both, id)!
      expect(box.x).toBeGreaterThan(0)
      expect(box.y).toBeGreaterThan(0)
    }
  })

  it('keeps half a metre round a crop, and the margin asked for', async () => {
    const kitchen = await call({ crop: 'kitchen' })
    const wide = await call({ crop: 'kitchen', margin: 2 })
    expect(kitchen.text).toContain('with 0.5 m round it')
    expect(wide.text).toContain('with 2 m round it')
    expect(px(wide)).toBeLessThan(px(kitchen))
    // The room no longer meets the picture's edge.
    expect(boxOf(kitchen, 'kitchen')!.x).toBeGreaterThan(0)
  })

  it('frames a flat by its name and the rooms meeting a fact', async () => {
    const flat = await call({ crop: 'Left flat' })
    expect(flat.text).toContain('cropped to flat "flat-a" (2 rooms on this floor)')
    expect(boxOf(flat, 'bed2')).toBeDefined()
    expect(boxOf(flat, 'bath')).toBeDefined()
    const household = await call({ crop: 'household = Rose' })
    expect(household.text).toContain('cropped to the 2 rooms where household = Rose')
    expect(boxOf(household, 'bed1')!.x).toBeGreaterThan(0)
    expect(boxOf(household, 'bed2')!.x).toBeGreaterThan(0)
  })

  it('frames a box of the plan, with no margin unless asked', async () => {
    const whole = await call({})
    const box = await call({ crop_box: { from: [3, 3], to: [0, 0] } })
    expect(box.text).toContain('cropped to x 0.00 to 3.00 and y 0.00 to 3.00 m,')
    expect(px(box)).toBeGreaterThan(px(whole))
    const bounds = (await call({ crop_box: { from: [0, 0], to: [3, 3] }, margin: 1 })).text
    expect(bounds).toContain('with 1 m round it')
  })

  it('draws the floor that holds the parts when no floor is named', async () => {
    const ctx = contextWith(() => undefined, resolve(__dirname, '../../../fixtures/two-floor-house.json'))
    const answer = await call({ crop: 'study' }, ctx)
    expect(answer.data['floor']).toBe('first')
    expect(answer.text).toContain('Plan of floor "first", cropped to room "study"')
    await expect(call({ crop: 'study', floor: 'ground' }, ctx)).rejects.toThrow(/names no room, door, window, wall or item drawn on floor "ground"/)
  })

  it('refuses a crop it cannot frame, saying which part', async () => {
    await expect(call({ crop: 'kitchen', crop_box: { from: [0, 0], to: [3, 3] } })).rejects.toThrow(/crop or crop_box, not both/)
    await expect(call({ crop_box: { from: [1, 1], to: [1, 4] } })).rejects.toThrow(/crop_box has no size/)
    await expect(call({ crop: 'kitchen, attic' })).rejects.toThrow(/crop's item 2 names no room/)
    await expect(call({ crop: 'household = Lily' })).rejects.toThrow(/No room drawn on floor "ground" meets crop's condition/)
    await expect(call({ margin: 1 })).rejects.toThrow(/pass it with crop or crop_box/)
  })
})
