/**
 * WRT-86: what the building comparison says of the plan's named types (C24), the rooms' finishes
 * and a wall's curve. A finish change is a changed room, never "Changes: none"; a type is named
 * with its figures and the parts that take it; a curve says its radius and bulge before and after,
 * and is marked changed for the picture, so its old curve is drawn.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { compareBuildings } from '../diff'
import { FloorPlanSchema } from '../../types/floorplan'

type Tuple = [number, number]

type Part = Record<string, unknown>

/** The plan file as written, before it is read. */
interface RawPlan {
  readonly version: string
  readonly units: string
  readonly types: { walls: Part[]; doors: Part[] }
  readonly walls: Part[]
  readonly rooms: Part[]
  readonly openings: Part[]
}

/** A 6 × 4 m room of four walls of a type, with a door of a type in its south wall. */
function typedRoom(change: (raw: RawPlan) => void = () => {}): FloorPlan {
  const wall = (id: string, start: Tuple, end: Tuple): Part => ({ id, start, end, height: 2.6, kind: 'exterior', wallType: 'brick' })
  const raw: RawPlan = {
    version: '1',
    units: 'm',
    types: {
      walls: [{ id: 'brick', name: 'Brick 300', thickness: 0.3 }, { id: 'block', name: 'Block 200', thickness: 0.2 }],
      doors: [{ id: 'd90', name: 'Door 900', width: 0.9, height: 2.1 }, { id: 'd100', name: 'Door 1000', width: 1, height: 2.1 }]
    },
    walls: [wall('s', [0, 0], [6, 0]), wall('e', [6, 0], [6, 4]), wall('n', [6, 4], [0, 4]), wall('w', [0, 4], [0, 0])],
    rooms: [{ id: 'studio', name: 'Studio', boundary: ['s', 'e', 'n', 'w'], finishes: { floor: 'Oak' } }],
    openings: [{ id: 'door', wall: 's', type: 'door', offset: 2, sill: 0, doorType: 'd90' }]
  }
  change(raw)
  return FloorPlanSchema.parse(raw) as FloorPlan
}

const texts = (plan: FloorPlan, later: FloorPlan): string[] => compareBuildings(plan, later).changes.map((c) => c.text)

describe('a room whose finishes changed (WRT-86)', () => {
  const before = typedRoom()
  const after = typedRoom((raw) => {
    raw.rooms[0]!['finishes'] = { floor: 'Porcelain tile', walls: 'Paint', skirting: false, faces: [{ wall: 'n', finish: 'Brick slips' }], bands: [{ finish: 'Tile', height: 1.2 }] }
  })

  it('is a changed room with each surface before and after, not the same building', () => {
    const compared = compareBuildings(before, after)
    expect(compared.sameBuilding).toBe(false)
    const room = compared.rooms.find((r) => r.room === 'studio')!
    expect(room.status).toBe('changed')
    expect(room.text).toBe('"Studio" floor finish "Oak" → "Porcelain tile"; walls finish not stated → "Paint"; skirting finish not stated → no skirting; finish of the face of wall "n" not stated → "Brick slips"; finish bands none → "Tile" 1.20 m high from 0.00 m')
    expect(compared.changes.map((c) => c.text)).toEqual([room.text])
    expect(compared.verdict).toContain('"Studio" floor finish "Oak" → "Porcelain tile"')
    expect(compared.finishes).toMatchObject([{ room: 'studio', changes: [{ surface: 'floor', before: 'Oak', after: 'Porcelain tile' }, { surface: 'walls' }, { surface: 'skirting', after: false }, { surface: 'face', wall: 'n' }, { surface: 'bands' }] }])
  })

  it('is no change when the finishes are the same', () => {
    const compared = compareBuildings(before, typedRoom())
    expect(compared.sameBuilding).toBe(true)
    expect(compared.finishes).toEqual([])
  })
})

describe('the types of the walls and doors (WRT-86)', () => {
  it('names a type added with its figures and the parts that took it, and each part its type before and after', () => {
    const after = typedRoom((raw) => {
      raw.types.walls.push({ id: 'conc', name: 'Concrete 250', thickness: 0.25 })
      raw.walls[1]!['wallType'] = 'conc'
    })
    const compared = compareBuildings(typedRoom(), after)
    const lines = compared.changes.map((c) => c.text)
    expect(lines).toContain('Wall type "Concrete 250" ("conc") added: thickness 0.25 m; taken by wall "e"')
    expect(lines.find((l) => l.startsWith('Wall "e"'))).toContain('thickness 0.30 → 0.25 m; type "Brick 300" → "Concrete 250"')
    expect(compared.types).toMatchObject([{ list: 'walls', type: 'conc', status: 'added', parts: [{ type: 'wall', id: 'e' }] }])
    expect(compared.verdict).toContain('Wall type "Concrete 250" ("conc") added')
    // The wall of another type is drawn changed, where it stood.
    expect(compared.marks.changed.walls).toContain('e')
  })

  it('names a type whose figure changed, with every part that takes it', () => {
    const after = typedRoom((raw) => {
      raw.types.walls[0]!['thickness'] = 0.35
    })
    const lines = texts(typedRoom(), after)
    expect(lines[0]).toBe('Wall type "Brick 300" ("brick") thickness 0.30 m → 0.35 m; taken by 4 walls: "s", "e", "n" and "w"')
    // Each wall is said once too, the four in one line.
    expect(lines).toContain('4 walls thickness 0.30 → 0.35 m: "e", "n", "s" and "w"')
  })

  it('names a type removed with the parts that took it, and a type with no parts', () => {
    const after = typedRoom((raw) => {
      raw.types.walls = raw.types.walls.filter((t) => t['id'] !== 'block')
      raw.types.walls.push({ id: 'spare', name: 'Spare' })
    })
    const lines = texts(typedRoom(), after)
    expect(lines).toContain('Wall type "Block 200" ("block") removed; no part took it')
    expect(lines).toContain('Wall type "Spare" ("spare") added; no part takes it')
  })

  it('says a door that takes another type, by the types\' names', () => {
    const after = typedRoom((raw) => {
      raw.openings[0]!['doorType'] = 'd100'
    })
    const lines = texts(typedRoom(), after)
    expect(lines.find((l) => l.startsWith('Door "door"'))).toContain('width 0.90 → 1.00 m; type "Door 900" → "Door 1000"')
  })
})

/** A room with an apse: its east side a curve from (6, 0) to (6, 4) round `centre`, turning `sweep` degrees; its west side slants, so no mirror lays it on itself. */
function apseRoom(centre: Tuple, sweep: number): FloorPlan {
  const straight = (id: string, start: Tuple, end: Tuple): Wall => ({ id, start, end, thickness: 0.2, height: 3, kind: 'exterior' })
  const apse: Wall = { id: 'apse', start: [6, 0], end: [6, 4], thickness: 0.2, height: 3, kind: 'exterior', arc: { centre, sweep } }
  const walls = [straight('south', [1, 0], [6, 0]), apse, straight('north', [6, 4], [0, 4]), straight('west', [0, 4], [1, 0])]
  return { version: '1', units: 'm', walls, rooms: [{ id: 'hall', name: 'Hall', boundary: walls.map((w) => w.id) }], openings: [] }
}

describe('a curve that changed (WRT-86)', () => {
  const half = apseRoom([6, 2], 180)

  it('says its radius and bulge before and after when it bows the other way, and marks it changed', () => {
    const inward = apseRoom([6, 2], -180)
    const compared = compareBuildings(half, inward)
    const line = compared.changes.find((c) => c.text.startsWith('Wall "apse"'))!.text
    expect(line).toContain('curve radius 2.00 → 2.00 m, bulge 1.000 → -1.000 (sweep 180° → -180°)')
    expect(line).not.toContain('curve changed')
    expect(compared.curves).toMatchObject([{ wall: 'apse', before: { radius: 2, sweep: 180 }, after: { radius: 2, sweep: -180 } }])
    expect(compared.curves[0]!.before!.bulge).toBeCloseTo(1, 6)
    // The picture draws the old curve outlined under the new one.
    expect(compared.marks.changed.walls).toContain('apse')
  })

  it('says a flatter curve with its new radius, bulge and sweep', () => {
    // The same ends, its centre 1.5 m further west: a radius of 2.50 m turning about 106°.
    const flatter = apseRoom([4.5, 2], 2 * (Math.atan2(2, 1.5) * 180) / Math.PI)
    const compared = compareBuildings(half, flatter)
    const line = compared.changes.find((c) => c.text.startsWith('Wall "apse"'))!.text
    expect(line).toMatch(/curve radius 2\.00 → 2\.50 m, bulge 1\.000 → 0\.500 \(sweep 180° → 106\.3°\)/)
    expect(compared.marks.changed.walls).toContain('apse')
  })

  it('gives the curve a wall had when it is made straight, and the one it has when made curved', () => {
    const straight = { ...half, walls: half.walls.map((w) => (w.id === 'apse' ? { ...w, arc: undefined } : w)) }
    delete (straight.walls[1] as { arc?: unknown }).arc
    expect(texts(half, straight).find((l) => l.startsWith('Wall "apse"'))).toContain('made straight (was curved: radius 2.00 m, bulge 1.000, sweep 180°)')
    expect(texts(straight, half).find((l) => l.startsWith('Wall "apse"'))).toContain('made curved: radius 2.00 m, bulge 1.000 (sweep 180°)')
  })
})
