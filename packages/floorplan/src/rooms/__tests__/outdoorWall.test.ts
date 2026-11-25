/**
 * WRT-31: the wall between a room and outdoor space (C26) is the building's outside wall however
 * the rooms are placed: `exterior`, at the outside thickness, and one answer in the file, the
 * check and the IFC. An outdoor space's own `walls` describes its edges, not the building.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText } from '../index'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { indexPlan } from '../../geometry/plan'
import { wallExposure, wallSides } from '../../geometry/exposure'
import { validatePlan } from '../../geometry/validate'
import { toIfc } from '../../geometry/export/ifc'

interface Written {
  readonly plan: FloorPlan
  readonly warnings: readonly { readonly code: string; readonly message: string }[]
}

function write(text: string): Written {
  const written = compileRoomsText(text)
  expect(written.problems).toEqual([])
  return { plan: parseFloorPlan(written.plan), warnings: written.warnings }
}

/** The walls with one room on one side and the other on the other, as kind and thickness. */
function between(plan: FloorPlan, a: string, b: string): Array<[string, number]> {
  const index = indexPlan(plan)
  return plan.walls
    .filter((wall) =>
      (wallSides(index, wall.id)?.stretches ?? []).some((s) => (s.left.includes(a) && s.right.includes(b)) || (s.left.includes(b) && s.right.includes(a)))
    )
    .map((wall) => [wall.kind ?? 'unstated', wall.thickness ?? 0])
}

/** `IsExternal` as the IFC writes it, by the wall's name. */
function ifcExternal(plan: FloorPlan): Map<string, boolean> {
  const lines = new Map<string, string>()
  for (const line of toIfc(plan).split('\n')) {
    const m = /^(#\d+)=(.*);$/.exec(line.trim())
    if (m) lines.set(m[1]!, m[2]!)
  }
  const found = new Map<string, boolean>()
  for (const [id, body] of lines) {
    const wall = /^IFCWALL(?:STANDARDCASE)?\('[^']*',#\d+,'([^']*)'/.exec(body)
    if (!wall) continue
    for (const rel of lines.values()) {
      const r = /^IFCRELDEFINESBYPROPERTIES\(.*,\(([^)]*)\),(#\d+)\)$/.exec(rel)
      if (!r || !r[1]!.split(',').includes(id)) continue
      const set = lines.get(r[2]!)!
      if (!set.includes("'Pset_WallCommon'")) continue
      const props = /\(([^()]*)\)\)$/.exec(set)![1]!.split(',')
      const flag = props.map((p) => lines.get(p)!).find((p) => p.includes("'IsExternal'"))!
      found.set(wall[1]!, flag.includes('IFCBOOLEAN(.T.)'))
    }
  }
  return found
}

/** The file's kind, the worked-out exposure and the IFC's `IsExternal` agree for every wall, and the check says nothing against them. */
function oneAnswer(plan: FloorPlan): void {
  const index = indexPlan(plan)
  const ifc = ifcExternal(plan)
  for (const wall of plan.walls) {
    const exposure = wallExposure(index, wall.id)
    expect([wall.id, wall.kind === 'exterior'], `${wall.id}: ${wall.kind} in the file, ${exposure} worked out`).toEqual([wall.id, exposure === 'exterior'])
    expect([wall.id, ifc.get(wall.id)]).toEqual([wall.id, exposure === 'exterior'])
  }
  const codes = validatePlan(plan).issues.map((issue) => issue.code)
  expect(codes).not.toContain('wall/kind-differs')
  expect(codes).not.toContain('opening/window-between-rooms')
}

/** Read back as rooms text and written again: the same walls. */
function readsBack(plan: FloorPlan): void {
  const reading = readRoomsText(plan)
  expect(reading.rawFloors).toEqual([])
  const again = write(reading.text).plan
  const walls = (p: FloorPlan): unknown => p.walls.map((wall) => [wall.id, wall.kind, wall.thickness]).sort()
  expect(walls(again)).toEqual(walls(plan))
}

describe('the wall between a room and outdoor space (WRT-31)', () => {
  it("is the building's outside wall when the balcony states thin walls of its own", () => {
    const { plan, warnings } = write(
      [
        'walls outside 0.18 inside 0.1 height 2.4',
        'room ldk "LDK" living 5 x 4 at 0,0',
        'room bal "Balcony" - 5.0 x 1.8 south of ldk outdoor balcony unroofed walls 0.05',
        'door d1 between ldk and bal, centred, 1.6 wide, sliding',
      ].join('\n')
    )
    expect(between(plan, 'ldk', 'bal')).toEqual([['exterior', 0.18]])
    expect(warnings.map((w) => w.code)).toEqual([])
    oneAnswer(plan)
    readsBack(plan)
  })

  it('is the outside wall beside a row of repeated rooms, and their windows into the garden are in an outside wall', () => {
    const { plan, warnings } = write(
      [
        'walls outside 0.3 inside 0.12 height 3',
        'unit grp',
        'room g "Group room" classroom 7 x 7 at 0,0',
        'room s "Sleep room" - 7 x 4 north of g',
        'end',
        'repeat grp 2 east as 1 at 0,0',
        'room garden "Garden" - 14.12 x 15 south of 1 align west outdoor garden unroofed',
        'window wg-1 between g-1 and garden, centred, 2 wide',
        'window wg-2 between g-2 and garden, centred, 2 wide',
      ].join('\n')
    )
    expect(between(plan, 'g-1', 'garden')).toEqual([['exterior', 0.3]])
    expect(between(plan, 'g-2', 'garden')).toEqual([['exterior', 0.3]])
    expect(warnings.map((w) => w.code)).not.toContain('rooms/inside-window')
    oneAnswer(plan)
    readsBack(plan)
  })

  it('is the outside wall when a balcony is placed beside a placed unit', () => {
    const { plan } = write(
      [
        'walls outside 0.18 inside 0.1 height 2.4',
        'unit flat',
        'room a "Living room" living 4 x 4 at 0,0',
        'room b "Bedroom" bedroom 3 x 4 east of a',
        'end',
        'place flat as f2 at 0,0',
        'room bal "Balcony" - 7.1 x 1.5 south of f2 outdoor balcony',
      ].join('\n')
    )
    expect(between(plan, 'a-f2', 'bal')).toEqual([['exterior', 0.18]])
    expect(between(plan, 'b-f2', 'bal')).toEqual([['exterior', 0.18]])
    oneAnswer(plan)
    readsBack(plan)
  })

  it("is the outside wall when a balcony is cut out of a room's corner", () => {
    const { plan } = write(
      [
        'walls outside 0.25 inside 0.1 height 2.7',
        'room living "Living room" living 6 x 5 at 0,0',
        'room loggia "Loggia" - 2 x 1.5 inside living corner se outdoor balcony',
      ].join('\n')
    )
    expect(between(plan, 'living', 'loggia')).toEqual([['exterior', 0.25], ['exterior', 0.25]])
    oneAnswer(plan)
    readsBack(plan)
  })

  it('says so once when rooms placed by hand leave the inside thickness, and a wall line keeps it quiet', () => {
    const lines = ['walls outside 0.3 inside 0.1 height 2.7', 'room shop "Shop" retail 8 x 6 at 0,0', 'room terrace "Terrace" - 8 x 4 at 0,-4.1 outdoor terrace']
    const { plan, warnings } = write(lines.join('\n'))
    expect(between(plan, 'shop', 'terrace')).toEqual([['exterior', 0.1]])
    const gap = warnings.filter((w) => w.code === 'rooms/wall-from-gap')
    expect(gap).toHaveLength(1)
    expect(gap[0]!.message).toContain("'wall between shop and terrace 0.10'")
    oneAnswer(plan)

    const stated = write([...lines, 'wall between shop and terrace 0.1'].join('\n'))
    expect(between(stated.plan, 'shop', 'terrace')).toEqual([['exterior', 0.1]])
    expect(stated.warnings.map((w) => w.code)).not.toContain('rooms/wall-from-gap')
    readsBack(stated.plan)
  })

  it("still lets a building room's own walls and a wall line set it", () => {
    const own = write(['walls outside 0.3 inside 0.1 height 2.7', 'room shop "Shop" retail 8 x 6 at 0,0 walls 0.2', 'room terrace "Terrace" - 8 x 4 south of shop outdoor terrace'].join('\n'))
    expect(between(own.plan, 'shop', 'terrace')).toEqual([['exterior', 0.2]])
    const line = write(['walls outside 0.3 inside 0.1 height 2.7', 'wall between shop and terrace 0.4', 'room shop "Shop" retail 8 x 6 at 0,0', 'room terrace "Terrace" - 8 x 4 south of shop outdoor terrace'].join('\n'))
    expect(between(line.plan, 'shop', 'terrace')).toEqual([['exterior', 0.4]])
  })
})
