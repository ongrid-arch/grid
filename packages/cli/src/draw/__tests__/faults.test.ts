import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { validatePlan } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { inspectPlan } from '@ongrid/rules'
import { LIGHT_LOOK, fileHeight, planPicture } from '@ongrid/viewer/src/picture'
import type { SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { checkPlan, checkText } from '../../command/check'
import type { LoadedPlan } from '../../command/plan'
import { drawPlan } from '../drawPlan'
import { twoBedFlat } from './twoBedFlat'

/**
 * MSG-8: what went wrong, shown on the drawing. A room Grid cannot draw stands as the box round
 * its walls with its name and why (SE-8); every line of the result has a mark on its part with
 * the number `grid check` gives it, and a PNG prints the words beside each mark (AU2-4).
 */

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

/** A plan the lab wrote, as the scoreboard keeps it. */
function labPlan(name: string): FloorPlan {
  const line = gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .find((l) => l.includes(`"name":${JSON.stringify(name)}`))
  if (!line) throw new Error(`no lab plan ${name}`)
  return parseFloorPlan(JSON.parse((JSON.parse(line) as { text: string }).text))
}

const loaded = (plan: FloorPlan): LoadedPlan => ({ file: 'plan.json', plan, ...validatePlan(plan) })

/** Every element of a tree, depth first. */
function* walk(nodes: readonly (SvgNode | string)[]): Generator<SvgNode> {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield node
    yield* walk(node.children)
  }
}
const textOf = (node: SvgNode): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')

/** The block of flats with the floor-4 bedroom whose walls are listed out of order. */
const block = (): FloorPlan => labPlan('D/scenarios/d2-mistake-floor4.json')

describe('a room that cannot be drawn (SE-8)', () => {
  it('is the box round its walls, with its name and the reason, not a blank', () => {
    const plan = block()
    const result = inspectPlan(plan)
    const line = result.lines.find((l) => l.thing.kind === 'room' && l.thing.id === 'L4-D-bed1')!
    expect(line.kind).toBe('left-out')

    const picture = planPicture(plan, { floor: 'L4', faults: result.lines })
    const nodes = [...walk(picture.nodes)]
    const box = nodes.find((n) => n.attrs['data-part'] === 'undrawn-room' && n.attrs['data-room'] === 'L4-D-bed1')
    expect(box).toBeDefined()

    // The box is round the walls the room lists, where they meet: every wall shorter than the
    // block is inside it.
    const walls = plan.rooms
      .find((r) => r.id === 'L4-D-bed1')!
      .boundary.map((id) => plan.walls.find((w) => w.id === id)!)
      .filter((w) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) < 8)
    expect(walls.length).toBeGreaterThan(0)
    const xs = walls.flatMap((w) => [w.start[0], w.end[0]])
    const ys = walls.flatMap((w) => [w.start[1], w.end[1]])
    const d = String(box!.attrs['d'])
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const boxXs = numbers.filter((_, i) => i % 2 === 0)
    const boxYs = numbers.filter((_, i) => i % 2 === 1).map((y) => -y)
    expect(Math.min(...boxXs)).toBeLessThanOrEqual(Math.min(...xs))
    expect(Math.max(...boxXs)).toBeGreaterThanOrEqual(Math.max(...xs))
    expect(Math.min(...boxYs)).toBeLessThanOrEqual(Math.min(...ys))
    expect(Math.max(...boxYs)).toBeGreaterThanOrEqual(Math.max(...ys))

    const label = nodes.find((n) => n.attrs['data-part'] === 'undrawn-label' && n.attrs['data-room'] === 'L4-D-bed1')!
    const texts = [...walk(label.children)]
    expect(textOf(texts.find((n) => n.attrs['data-part'] === 'undrawn-name')!)).toBe('Flat D Bedroom 1')
    const reason = texts.filter((n) => n.attrs['data-part'] === 'undrawn-reason').map(textOf).join(' ')
    expect(reason).toBe(line.message)

    // And its numbered mark, with the number the record gives the line.
    const number = result.lines.indexOf(line) + 1
    const mark = nodes.find((n) => n.attrs['data-part'] === 'fault-mark' && n.attrs['data-id'] === 'L4-D-bed1')!
    expect(String(mark.attrs['data-numbers']).split(', ')).toContain(String(number))
  })

  it('stands as a box even with no result given, as in the app', () => {
    const nodes = [...walk(planPicture(block(), { floor: 'L4' }).nodes)]
    expect(nodes.some((n) => n.attrs['data-part'] === 'undrawn-room' && n.attrs['data-room'] === 'L4-D-bed1')).toBe(true)
    expect(nodes.some((n) => n.attrs['data-part'] === 'fault-mark')).toBe(false)
  })

  it('is boxed by where its walls meet, not by the whole length of a wall it shares', () => {
    const plan = block()
    const room = planPicture(plan, { floor: 'L4' }).nodes.find((n) => n.attrs['data-part'] === 'undrawn-room')!
    const xs = String(room.attrs['d']).match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0)
    // The bedroom is a few metres across; the outside wall it lists runs the whole block.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(8)
  })
})

describe('the numbered marks match the report', () => {
  it('give every line on the floor its grid check number, on its part or in the key', () => {
    const plan = block()
    const check = checkPlan(loaded(plan), {})
    const text = checkText(check, 6)
    const picture = planPicture(plan, { floor: 'L4', faults: check.result.lines })
    const nodes = [...walk(picture.nodes)]
    const key = [...walk(picture.key!.nodes)]
    const marked = new Map<string, string[]>()
    for (const mark of nodes.filter((n) => n.attrs['data-part'] === 'fault-mark')) {
      const key = `${mark.attrs['data-thing']}:${mark.attrs['data-id']}`
      marked.set(key, [...(marked.get(key) ?? []), ...String(mark.attrs['data-numbers']).split(', ')])
      // Every mark on a part has its words beside it, but an undrawn room's, whose words are in
      // its box. A note about the whole floor has them where they hide nothing, and in the key.
      const words = [...walk(mark.children)].filter((n) => n.attrs['data-part'] === 'fault-mark-text').map(textOf).join(' ')
      if (key === 'room:L4-D-bed1') expect(words).toBe('')
      else if (mark.attrs['data-thing'] !== 'floor') {
        for (const n of String(mark.attrs['data-numbers']).split(', ')) expect(words).toContain(check.result.lines[Number(n) - 1]!.message)
      }
    }
    const keyNumbers = key.filter((n) => n.attrs['data-part'] === 'key-number').map(textOf)

    const onFloor = check.result.lines.flatMap((line, index) => (line.floor === null || line.floor === 'L4' ? [{ line, number: index + 1 }] : []))
    expect(onFloor.length).toBeGreaterThan(0)
    expect(keyNumbers).toEqual(onFloor.map(({ number }) => String(number)))
    for (const { line, number } of onFloor) {
      // The report prints the same number before the same words.
      expect(text).toContain(`  ${number}. `)
      expect(text.split('\n').find((l) => l.startsWith(`  ${number}. `))).toContain(line.message)
      // Every line has its mark on its part; one about the floor or the plan is in the key only,
      // so nothing of it covers a wall (VEW-17).
      const own = marked.get(`${line.thing.kind}:${line.thing.id}`)
      if (line.thing.kind === 'floor' || line.thing.kind === 'plan') expect(own, `${number} ${line.code}`).toBeUndefined()
      else if (own !== undefined) expect(own, `${number} ${line.code}`).toContain(String(number))
    }
    // The door that runs off its wall is marked on that wall.
    const door = check.result.lines.find((l) => l.code === 'opening/out-of-wall')!
    const wall = plan.openings.find((o) => o.id === door.thing.id)!.wall
    const centre = plan.walls.find((w) => w.id === wall)!
    const mark = nodes.find((n) => n.attrs['data-part'] === 'fault-mark' && n.attrs['data-id'] === door.thing.id)!
    const [, mx, my] = /translate\((\S+) (\S+)\)/.exec(String(mark.attrs['transform']))!.map(Number) as [number, number, number]
    expect(mx).toBeCloseTo((centre.start[0] + centre.end[0]) / 2, 6)
    expect(-my).toBeCloseTo((centre.start[1] + centre.end[1]) / 2, 6)
    // The lines of other floors are counted, not listed.
    const elsewhere = check.result.lines.length - onFloor.length
    expect(key.some((n) => n.attrs['data-part'] === 'key-elsewhere' && textOf(n) === `${elsewhere} more on other floors.`)).toBe(elsewhere > 0)
  })

  it('keep a line\'s number when the check is of one floor', () => {
    const plan = block()
    const whole = checkPlan(loaded(plan), {})
    const one = checkPlan(loaded(plan), { floor: 'L4' })
    const at = (line: unknown): number => whole.result.lines.findIndex((l) => JSON.stringify(l) === JSON.stringify(line)) + 1
    expect(one.numbers.length).toBeGreaterThan(0)
    one.result.lines.forEach((line, index) => expect(one.numbers[index]).toBe(at(line)))
  })

  it('leave a plan with nothing to look at as it was', () => {
    const plan = twoBedFlat()
    const result = inspectPlan(plan)
    const lines = result.lines.filter(() => false)
    const bare = planPicture(plan)
    const given = planPicture(plan, { faults: lines })
    expect(given.nodes).toEqual(bare.nodes)
    expect(given.key).toBeNull()
  })
})

/** The flat with a short wall put where its first door swings. */
function blockedDoor(): FloorPlan {
  const plan = twoBedFlat()
  const door = plan.openings.find((o) => o.type === 'door' && o.hinge !== undefined && o.swing !== undefined)!
  const host = plan.walls.find((w) => w.id === door.wall)!
  const [sx, sy] = host.start
  const [ex, ey] = host.end
  const len = Math.hypot(ex - sx, ey - sy)
  const [dx, dy] = [(ex - sx) / len, (ey - sy) / len]
  // Across the door's middle, on both faces of its wall, so it is hit whichever way it opens.
  const mid = door.offset + door.width / 2
  const [cx, cy] = [sx + dx * mid, sy + dy * mid]
  const reach = door.width * 0.6
  plan.walls.push({ id: 'blocker', start: [cx - dy * reach, cy + dx * reach], end: [cx + dy * reach, cy - dx * reach], thickness: 0.05, height: 2.6, kind: 'partition' })
  return plan
}

describe('a PNG prints the warning words beside each mark (AU2-4)', () => {
  it('writes the words of a door warning beside its numbered mark, and a key under the drawing', async () => {
    const plan = blockedDoor()
    const result = inspectPlan(plan)
    const sweeps = result.lines.filter((l) => l.thing.kind === 'opening')
    expect(sweeps.length).toBeGreaterThan(0)

    const picture = planPicture(plan, { faults: result.lines })
    const nodes = [...walk(picture.nodes)]
    for (const line of sweeps) {
      const mark = nodes.find((n) => n.attrs['data-part'] === 'fault-mark' && n.attrs['data-id'] === line.thing.id)!
      const words = [...walk(mark.children)].filter((n) => n.attrs['data-part'] === 'fault-mark-text').map(textOf).join(' ')
      expect(words).toContain(line.message)
      // The plain dot is not drawn under the numbered mark.
      expect(nodes.some((n) => n.attrs['data-part'] === 'door-warning' && n.attrs['data-opening'] === line.thing.id)).toBe(false)
    }

    const png = await drawPlan(plan, { format: 'png', faults: result.lines })
    const image = await loadImage(Buffer.from(png))
    expect(image.height).toBe(fileHeight(picture))
    expect(image.height).toBeGreaterThan(picture.height)
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)

    // The words are painted: warning-coloured pixels beside the mark, where the text was placed.
    const mark = nodes.find((n) => n.attrs['data-part'] === 'fault-mark' && n.attrs['data-id'] === sweeps[0]!.thing.id)!
    const [, mx, my] = /translate\((\S+) (\S+)\)/.exec(String(mark.attrs['transform']))!.map(Number) as [number, number, number]
    const px = ((mx - picture.view.x) / picture.view.width) * picture.width
    const py = ((my - picture.view.y) / picture.view.height) * picture.height
    const words = [...walk(mark.children)].find((n) => n.attrs['data-part'] === 'fault-mark-text')!
    const x0 = Math.round(px + Number(words.attrs['x']))
    const y0 = Math.round(py + Number(words.attrs['y']))
    const { data } = context.getImageData(x0, y0 - 10, 120, 13)
    const ink = Number.parseInt(LIGHT_LOOK.warning.slice(1), 16)
    const near = (i: number): boolean =>
      Math.abs(data[i]! - (ink >> 16)) < 40 && Math.abs(data[i + 1]! - ((ink >> 8) & 255)) < 40 && Math.abs(data[i + 2]! - (ink & 255)) < 40
    let painted = 0
    for (let i = 0; i < data.length; i += 4) if (near(i)) painted++
    expect(painted).toBeGreaterThan(20)

    // The key under the drawing has ink too.
    const below = context.getImageData(0, picture.height + 4, image.width, image.height - picture.height - 4).data
    let dark = 0
    for (let i = 0; i < below.length; i += 4) if (below[i]! < 120) dark++
    expect(dark).toBeGreaterThan(50)
  }, 60_000)
})
