/**
 * CNT-59: what another tool calls a part (`identity`) goes back to it in the IFC and the DXF: the
 * GlobalId as the element's GlobalId, the name as its Name and the tag as its Tag, in place of
 * Grid's own, and on the DXF's facts layer, with a door's tag as its block's MARK. No other
 * element is given a kept GlobalId, and one two parts state is written once.
 */
import { describe, expect, it } from 'vitest'
import { ifcGlobalId, parseFloorPlan, safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { exportPlan } from '../planExport'
import { factsOffice } from '../../test-support/facts'
import { readDxf, valueOf } from '../../geometry/export/__tests__/dxf-reader'

const OPTIONS = { projectId: 'identity', projectName: 'Office', now: new Date('2026-11-27T12:00:00.000Z') }

const WALL_GUID = '2O2Fr$t4X7Zf8NOew3FLOH'
const DOOR_GUID = '1hqIFTRjfV6AWq_bMtnZwI'
const ROOM_UUID = '6b1f1d2e-8c4a-4e5f-9a7b-3c2d1e0f4a5b'
const FLOOR_GUID = '3cUkl32yn9qRSPvBJVyWYp'

const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

/** The facts office with an identity on its first wall, first door, first room and first floor. */
function named(): FloorPlan {
  const plan = parseFloorPlan(factsOffice())
  const door = plan.openings.find((o) => o.type === 'door')!
  return {
    ...plan,
    walls: plan.walls.map((w, i) => (i === 0 ? { ...w, identity: { guid: WALL_GUID, name: 'Basic Wall:Exterior 300', tag: '348112' } } : w)),
    openings: plan.openings.map((o) => (o === door ? { ...o, identity: { guid: DOOR_GUID, name: 'Single-Flush:900x2100', tag: 'D-101' } } : o)),
    rooms: plan.rooms.map((r, i) => (i === 0 ? { ...r, identity: { guid: ROOM_UUID, name: '0.01', tag: 'R-01' } } : r)),
    floors: plan.floors!.map((f, i) => (i === 0 ? { ...f, identity: { guid: FLOOR_GUID, name: 'Level 0' } } : f)),
  }
}

/** Each IFC line by its type: the line's text. */
const lines = (ifc: string, type: string): string[] => ifc.split('\n').filter((l) => new RegExp(`^#\\d+=${type}\\(`).test(l))
const globalIds = (ifc: string): string[] => [...ifc.matchAll(/^#\d+=IFC[A-Z0-9]+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]!)

describe('the schema (CNT-59)', () => {
  it('takes a GlobalId in IFC form or a UUID, and refuses other text and a misspelt field', () => {
    const plan = factsOffice() as { walls: Record<string, unknown>[] }
    const withIdentity = (identity: unknown): unknown => ({ ...plan, walls: plan.walls.map((w, i) => (i === 0 ? { ...w, identity } : w)) })
    expect(safeParseFloorPlan(withIdentity({ guid: WALL_GUID }))).not.toBeNull()
    expect(safeParseFloorPlan(withIdentity({ guid: ROOM_UUID, name: 'Wall', tag: '1' }))).not.toBeNull()
    expect(safeParseFloorPlan(withIdentity({ guid: 'wall-1' }))).toBeNull()
    expect(safeParseFloorPlan(withIdentity({ guid: '4O2Fr$t4X7Zf8NOew3FLOH' }))).toBeNull()
    expect(safeParseFloorPlan(withIdentity({ gid: WALL_GUID }))).toBeNull()
  })

  it('gives a UUID in IFC\'s 22-character form, and a GlobalId as it is', () => {
    expect(ifcGlobalId(WALL_GUID)).toBe(WALL_GUID)
    // The all-zero and all-one UUIDs bound the packing: 2 bits, then 6 bits a character.
    expect(ifcGlobalId('00000000-0000-0000-0000-000000000000')).toBe('0'.repeat(22))
    expect(ifcGlobalId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(`3${'$'.repeat(21)}`)
    expect(ifcGlobalId('{6B1F1D2E8C4A4E5F9A7B3C2D1E0F4A5B}')).toBe(ifcGlobalId(ROOM_UUID))
    expect(ifcGlobalId('wall-1')).toBeNull()
  })
})

describe('the IFC (CNT-59)', () => {
  const plan = named()
  const ifc = text(exportPlan(plan, 'ifc', OPTIONS).data)

  it('writes the kept GlobalId, Name and Tag of a wall, a door, a space and a storey', () => {
    expect(lines(ifc, 'IFCWALLSTANDARDCASE').find((l) => l.includes(`'${WALL_GUID}'`))).toMatch(/,'Basic Wall:Exterior 300',\$,\$,#\d+,#\d+,'348112'\);$/)
    expect(lines(ifc, 'IFCDOOR').find((l) => l.includes(`'${DOOR_GUID}'`))).toMatch(/,'Single-Flush:900x2100',\$,\$,#\d+,#\d+,'D-101',/)
    const space = lines(ifc, 'IFCSPACE').find((l) => l.includes(`'${ifcGlobalId(ROOM_UUID)}'`))
    expect(space).toBeDefined()
    expect(space).toContain(`,'0.01',`)
    expect(lines(ifc, 'IFCBUILDINGSTOREY').find((l) => l.includes(`'${FLOOR_GUID}'`))).toContain(`,'Level 0',`)
    // A space has no Tag in IFC2X3: its tag is a fact of its set.
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('tag',$,IFCLABEL('R-01'),$)")
  })

  it('gives no other element a kept GlobalId, and keeps the ids Grid issues for the rest', () => {
    const ids = globalIds(ifc)
    expect(new Set(ids).size).toBe(ids.length)
    for (const kept of [WALL_GUID, DOOR_GUID, ifcGlobalId(ROOM_UUID)!, FLOOR_GUID]) expect(ids.filter((id) => id === kept)).toHaveLength(1)
    // A plan with no identity writes the file it wrote before, but for the four kept GlobalIds and names.
    const plain = text(exportPlan(parseFloorPlan(factsOffice()), 'ifc', OPTIONS).data)
    expect(globalIds(plain).length).toBe(ids.length)
  })

  it('writes a GlobalId two parts state once, on the first', () => {
    const twice: FloorPlan = { ...plan, walls: plan.walls.map((w, i) => (i === 1 ? { ...w, identity: { guid: WALL_GUID } } : w)) }
    const ids = globalIds(text(exportPlan(twice, 'ifc', OPTIONS).data))
    expect(ids.filter((id) => id === WALL_GUID)).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the DXF (CNT-59)', () => {
  const plan = named()
  const dxf = text(exportPlan(plan, 'dxf', { ...OPTIONS, floorId: plan.floors![0]!.id }).data)

  it('writes each identity on the facts layer and a door\'s tag as its MARK', () => {
    const facts = dxfFacts(dxf)
    expect(facts).toContainEqual({ id: plan.walls[0]!.id, name: 'GUID', value: WALL_GUID })
    expect(facts).toContainEqual({ id: plan.walls[0]!.id, name: 'tag', value: '348112' })
    const door = plan.openings.find((o) => o.identity !== undefined)!
    expect(facts).toContainEqual({ id: door.id, name: 'GUID', value: DOOR_GUID })
    expect(facts).toContainEqual({ id: plan.rooms[0]!.id, name: 'name', value: '0.01' })
    const marks = readDxf(dxf).entities.filter((e) => e.type === 'ATTRIB' && valueOf(e, 2) === 'MARK').map((e) => valueOf(e, 1))
    expect(marks).toContain('D-101')
    expect(marks).not.toContain(door.id)
    const numbers = readDxf(dxf).entities.filter((e) => e.type === 'ATTRIB' && valueOf(e, 2) === 'NUMBER').map((e) => valueOf(e, 1))
    expect(numbers).toContain('R-01')
  })
})

/** The DXF's facts, read back: every TEXT on `GRID-FACTS`, as `[id] name: value`. */
function dxfFacts(dxf: string): { id: string; name: string; value: string }[] {
  return readDxf(dxf)
    .entities.filter((e) => e.type === 'TEXT' && valueOf(e, 8) === 'GRID-FACTS')
    .flatMap((e) => {
      const m = /^\[(.+?)\] (.+?): (.*)$/.exec(valueOf(e, 1) ?? '')
      return m ? [{ id: m[1]!, name: m[2]!, value: m[3]! }] : []
    })
}
