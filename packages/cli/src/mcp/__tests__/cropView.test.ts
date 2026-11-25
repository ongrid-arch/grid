import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { drawPlan } from '../../draw/drawPlan'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'

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
    await expect(view.run({ plan: 'plan.json', kind: 'plan', crop: 'attic' }, context())).rejects.toThrow(/Its rooms: "bed2" \("Bedroom 2"\)/)
    await expect(view.run({ plan: 'plan.json', kind: '3d', crop: 'kitchen' }, context())).rejects.toThrow(/not crop/)
  })
})
