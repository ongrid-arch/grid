import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import type { PlanRoom, Vec2 } from '@ongrid/floorplan/geometry'
import { buildDimensions, buildFloorPlan, centroid, doorSwing, planForFloor, rectOf, rectInsidePolygon, rectTouchesPolygon, resolveFloor, spotsInside } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Box, LabelForm } from '../../canvas2d/labelPlacement'
import { SMALL_LABEL, doorSwingBox, formBox, formCorners } from '../../canvas2d/labelPlacement'
import { fitTo } from '../../canvas2d/viewport'
import { LIGHT_LOOK, TEXT_PX } from '../look'
import { framingOf, handingsOf, planPicture } from '../planSvg'
import { drawnHanding, planScene } from '../scene'
import type { SvgNode } from '../svgNode'

/**
 * SHT-5 on every plan the scoreboard keeps: the lab's own plans and the generated awkward
 * shapes (L, T, U, Z, courtyards, turned rooms, tight rooms). Each floor is drawn at two
 * picture sizes, framed as `planPicture` frames it, and the labels are read back from what
 * was drawn. The door-sweep warnings are left out: they only add marks, they move no label,
 * and on the lab's 5,000-room plans they take most of the time.
 *
 * Every label is inside its room and the picture, clear of door swings and other labels.
 * The room label does not leave on a leader.
 */

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

interface Stored {
  readonly name: string
  readonly text: string
}

function stored(file: string): Stored[] {
  return gunzipSync(readFileSync(resolve(DATA, file)))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Stored)
}

/** The plans that read: some are broken on purpose and are skipped. */
function plans(): { name: string; plan: FloorPlan }[] {
  const out: { name: string; plan: FloorPlan }[] = []
  const bench = JSON.parse(readFileSync(resolve(DATA, 'bench-examples.json'), 'utf8')) as Record<string, unknown>
  const all = [
    ...Object.entries(bench).map(([name, raw]) => ({ name: `bench/${name}`, raw: () => raw })),
    ...[...stored('lab-plans.ndjson.gz'), ...stored('generated-plans.ndjson.gz')].map((p) => ({
      name: p.name,
      raw: () => JSON.parse(p.text) as unknown
    }))
  ]
  for (const { name, raw } of all) {
    try {
      out.push({ name, plan: parseFloorPlan(raw()) })
    } catch {
      // Not a plan: nothing to draw.
    }
  }
  return out
}

function inside(p: Vec2, polygon: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) odd = !odd
  }
  return odd
}

const overlap = (a: Box, b: Box): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/** The box of a door's swing: its hinge and the arc, finely sampled. */
function swingBox(at: Vec2, radius: number, from: number, to: number): Box {
  let turn = to - from
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const xs = [at.x]
  const ys = [at.y]
  for (let i = 0; i <= 90; i++) {
    const angle = from + (turn * i) / 90
    xs.push(at.x + radius * Math.cos(angle))
    ys.push(at.y + radius * Math.sin(angle))
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

function boxCorners({ minX, minY, maxX, maxY }: Box): Vec2[] {
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
}

const numbers = (text: string, pattern: RegExp): number[] => {
  const m = pattern.exec(text)
  if (!m) throw new Error(`no match in ${text}`)
  return m.slice(1).map(Number)
}

const textOf = (node: SvgNode | string | undefined): string =>
  node === undefined ? '' : typeof node === 'string' ? node : node.children.map(textOf).join('')

interface DrawnLabel {
  readonly room: PlanRoom
  readonly at: Vec2
  readonly box: Box
  readonly form: LabelForm
}

/** The labels as drawn, read back from the picture's elements. */
function drawnLabels(nodes: readonly SvgNode[], rooms: readonly PlanRoom[], mpp: number): DrawnLabel[] {
  const byId = new Map(rooms.map((room) => [room.id, room]))
  const out: DrawnLabel[] = []
  for (const node of nodes) {
    if (!node.key?.startsWith('label:')) continue
    const id = node.key.slice('label:'.length)
    const room = byId.get(id)!
    const [x, y] = numbers(String(node.attrs.transform), /translate\((\S+) (\S+)\)/)
    const at = { x: x!, y: -y! }
    // VEW-13: the form it was written in, read back from its lines, their size and its turn.
    const children = node.children as SvgNode[]
    const names = children.filter((child) => child.attrs['data-part'] === 'label')
    const areaNode = children.find((child) => child.attrs['data-part'] === 'area')
    const scale = Number(names[0]!.attrs['font-size']) / TEXT_PX.roomName
    const turn = /rotate\(([^)]+)\)/.exec(String(node.attrs.transform))?.[1]
    const form: LabelForm = {
      names: names.map(textOf), area: areaNode === undefined ? null : textOf(areaNode),
      scale, angle: -Number(turn ?? 0), keyed: node.attrs['data-keyed'] !== undefined
    }
    out.push({ room, at, box: formBox(form, at, mpp), form })
  }
  return out
}

const ALL = plans()

/**
 * The U-shaped rooms of DR-3 (group B's finding B-11, scenarios s14 and s03d, as AU2 re-ran
 * them), and the lab's plain U.
 */
const U_PLANS = [
  'AU2/scenarios/B-s14-sweep-t09/plan.json',
  'AU2/scenarios/B-s03d-ring-two-halves/plan.json',
  'AU1/scenarios/AR-1/u-shape.json'
]
const WIDTHS = [1200, 2400] as const

interface Tally {
  floors: number
  labels: number
  leaders: number
  /** Rooms with no clear spot anywhere at this size, whose label is not drawn. */
  hidden: number
  /** Plans with a hidden label. */
  crowded: Set<string>
  /** VEW-13: labels written as their room's number. */
  keyed: number
  /** VEW-13: rooms with no spot for even their number clear of the door swings, left unlabelled. */
  slivers: number
  /** Rooms whose old label point, the average of the corners, lay outside the room. */
  centreOutside: number
  failures: string[]
}

const TALLIES = new Map<number, Tally>(
  WIDTHS.map((width) => [width, { floors: 0, labels: 0, leaders: 0, hidden: 0, crowded: new Set(), keyed: 0, slivers: 0, centreOutside: 0, failures: [] }])
)

/** The floor drawn as `planPicture` draws it, `width` pixels wide, without the warning marks. */
function scene(slice: FloorPlan, drawing: ReturnType<typeof buildFloorPlan>, width: number) {
  const dimensions = buildDimensions(drawing)
  const framed = framingOf(drawing, dimensions)
  const shape = framed.width > 0 && framed.height > 0 ? framed.height / framed.width : 0.75
  const height = Math.max(1, Math.round(width * Math.min(Math.max(shape, 0.4), 2.5)))
  const view = fitTo(framed, width / height)
  const mpp = view.width / width
  const nodes = planScene({ drawing, handings: handingsOf(slice), doorWarnings: new Map(), dimensions, metersPerPixel: mpp, look: LIGHT_LOOK })
  return { nodes, mpp, view }
}

for (const { name, plan } of ALL) {
  const floors = plan.floors?.map((floor) => floor.id) ?? [null]
  for (const floor of floors) {
    const slice = planForFloor(plan, resolveFloor(plan, floor))
    const drawing = buildFloorPlan(slice)
    if (drawing.rooms.length === 0) continue
    for (const width of WIDTHS) {
      const tally = TALLIES.get(width)!
      const { nodes, mpp, view } = scene(slice, drawing, width)
      const labels = drawnLabels(nodes, drawing.rooms, mpp)
      tally.floors++
      tally.labels += labels.length
      const where = `${name}${floor ? ` floor ${floor}` : ''} at ${width} px`
      const handings = handingsOf(slice)
      const swings: Box[] = []
      for (const opening of drawing.openings) {
        if (opening.type !== 'door') continue
        const handing = handings.get(opening.id)
        // VEW-22: a wide door with no kind is drawn as Grid's guess, and sweeps what that sweeps.
        const drawn = drawnHanding(opening, handing)
        if (drawn !== handing) {
          const box = doorSwingBox(opening, drawn, mpp)
          if (box) swings.push(box)
          continue
        }
        const swing = doorSwing(opening, handing?.hinge, handing?.swing)
        if (swing) swings.push(swingBox(swing.arc.center, swing.arc.radius, swing.arc.from, swing.arc.to))
      }

      // VEW-13: a room with no spot for even its number clear of the door swings, a sliver or a
      // closet the doors sweep, is left unlabelled rather than named over its neighbours; only
      // another hidden label makes the floor crowded.
      const smallest = formBox({ names: ['8'], area: null, scale: SMALL_LABEL, angle: 0, keyed: true }, { x: 0, y: 0 }, mpp)
      const half = { x: (smallest.maxX - smallest.minX) / 2, y: (smallest.maxY - smallest.minY) / 2 }
      // The air the placement keeps round a swing: its padding and a pixel more.
      const air = 3 * mpp
      const drawnIds = new Set(labels.map((label) => label.room.id))
      const slivers = drawing.rooms.filter(
        (room) =>
          !drawnIds.has(room.id) &&
          !spotsInside(room.polygon, half.x, half.y, room.holes).some((spot) => !swings.some((swing) => overlap(swing, { minX: spot.x - half.x - air, maxX: spot.x + half.x + air, minY: spot.y - half.y - air, maxY: spot.y + half.y + air })))
      ).length
      tally.slivers += slivers
      const crowded = labels.length + slivers < drawing.rooms.length
      if (crowded) {
        tally.hidden += drawing.rooms.length - labels.length - slivers
        tally.crowded.add(name)
      }

      tally.leaders += nodes.filter((node) => node.key?.startsWith('leader:')).length
      labels.forEach((label, i) => {
        const room = label.room
        if (!inside(centroid(room.polygon), room.polygon)) tally.centreOutside++
        if (!inside(label.at, room.polygon)) tally.failures.push(`${where}: ${room.id}'s anchor is outside the room`)
        for (const other of labels.slice(i + 1)) {
          if (overlap(label.box, other.box)) tally.failures.push(`${where}: ${room.id}'s label is on ${other.room.id}'s`)
        }
        // In the picture: its view is in plan metres with y down.
        const shown = label.box.minX >= view.x && label.box.maxX <= view.x + view.width && -label.box.maxY >= view.y && -label.box.minY <= view.y + view.height
        if (!shown) tally.failures.push(`${where}: ${room.id}'s label is outside the picture`)
        const rad = label.form.angle * Math.PI / 180
        const local = (p: Vec2): Vec2 => ({ x: p.x * Math.cos(rad) + p.y * Math.sin(rad), y: -p.x * Math.sin(rad) + p.y * Math.cos(rad) })
        const box = rectOf(formCorners(label.form, label.at, mpp).map(local))
        if (swings.some((swing) => rectTouchesPolygon(box, boxCorners(swing).map(local)))) {
          tally.failures.push(`${where}: ${room.id}'s label is on a door swing`)
        }
        if (!rectInsidePolygon(box, room.polygon.map(local), room.holes.map((hole) => hole.map(local)))) {
          tally.failures.push(`${where}: ${room.id}'s label spills out of the room`)
        }
        if (label.form.keyed) tally.keyed++
      })
    }
  }
}

describe('room labels on every scoreboard plan (SHT-5)', () => {
  it('reads the stored plans, the lab’s U-shaped rooms among them', () => {
    expect(ALL.length).toBeGreaterThan(3000)
    const names = new Set(ALL.map(({ name }) => name))
    for (const name of U_PLANS) expect(names.has(name), name).toBe(true)
  })

  it.each(WIDTHS)('anchors every label in its own room, clear of swings and other labels, at %s px', (width) => {
    const tally = TALLIES.get(width)!
    expect(tally.failures.slice(0, 20)).toEqual([])
    expect(tally.floors).toBeGreaterThan(3000)
    // Rooms where the old point, the corners' average, fell outside: the U-shaped rooms and
    // the other notched ones. Their labels are now inside too (checked above).
    expect(tally.centreOutside).toBeGreaterThan(0)
    expect(tally.leaders).toBe(0)
  })

  it.each(WIDTHS)('hides a label only on the lab’s stress plans, with no clear spot left, at %s px', (width) => {
    // The size tests (grids of 100 to 5,000 rooms on one picture), the names of a hundred
    // characters, and coordinates of 10²¹ m. At a fixed text size their labels cannot all fit
    // in the picture; the rest stay off each other.
    // VEW-13: and the generated tight plans, where a closet swept by its doors and hemmed in by
    // its neighbours has no clear spot even for its number: it is left unlabelled at this size
    // rather than named over the rooms round it.
    const stress = /(^|\/)(size|odd|tight)\/|k-grid-|k-accents/
    expect([...TALLIES.get(width)!.crowded].filter((name) => !stress.test(name))).toEqual([])
  })

  it('puts each U-shaped room’s label in the room, not in its notch', () => {
    const found = ALL.filter(({ name }) => U_PLANS.includes(name))
    let notched = 0
    for (const { plan } of found) {
      const drawing = buildFloorPlan(planForFloor(plan, resolveFloor(plan, null)))
      const picture = planPicture(plan, { width: 3000 })
      const labels = drawnLabels(picture.nodes, drawing.rooms, picture.view.width / picture.width)
      for (const label of labels) {
        // A U: eight corners, and their average in the notch, where the label used to go.
        if (label.room.polygon.length !== 8 || inside(centroid(label.room.polygon), label.room.polygon)) continue
        notched++
        expect(inside(label.at, label.room.polygon)).toBe(true)
      }
    }
    expect(notched).toBe(4)
  })
})
