/**
 * WRT-88: a bay window written in one rooms text line, curved or canted, comes out as the
 * room's outline with the bay in it, its walls (one curved wall, or three straight ones, named
 * after the bay) and its windows on their facets or spread along the curve, clear of the walls
 * that meet them; what cannot be built is refused by name; and the plan reads back.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { wallLength } from '../../geometry/wall'
import { limit } from '../../geometry/tolerances'
import { safeParseFloorPlan, statedOpening, statedWall, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { stampFor } from '../stamp'

const LIVING = 'room living "Living" living 4 x 5 at 0,0\n'

function written(text: string): { plan: FloorPlan; result: ReturnType<typeof compileRoomsText> } {
  const result = compileRoomsText(text)
  expect(result.problems.map((p) => p.message)).toEqual([])
  expect(result.warnings.map((w) => w.message)).toEqual([])
  const plan = safeParseFloorPlan(result.plan)!
  expect(validatePlan(plan).issues.map((i) => `${i.code}: ${i.message}`)).toEqual([])
  return { plan, result }
}

const refused = (text: string): string => compileRoomsText(text).problems.map((p) => `${p.code}: ${p.message}`).join(' | ')
const wall = (plan: FloorPlan, id: string) => plan.walls.find((w) => w.id === id)!
const bayWindows = (plan: FloorPlan) => plan.openings.filter((o) => o.id.includes('-bay'))

describe('a bay window in rooms text (WRT-88)', () => {
  it('writes a curved bay as one curved wall with its windows spread along it', () => {
    const { plan, result } = written(`${LIVING}bay in living south, 2.4 wide, 0.9 deep, curved, windows 3\n`)
    const bay = wall(plan, 'living-bay-wall')
    // The chord is the width and the depth its sagitta: radius (w²/4 + d²) / 2d to the inside face.
    const r = (1.44 + 0.81) / 1.8
    expect(bay.arc!.centre).toEqual([2, r - 0.9])
    expect(Math.hypot(bay.start[0] - 2, bay.start[1] - (r - 0.9))).toBeCloseTo(r + bay.thickness / 2, 3)
    expect(bay.kind).toBe('exterior')
    expect(plan.walls.filter((w) => w.arc !== undefined)).toHaveLength(1)
    // The room gains the segment the arc closes off the side.
    const turn = 4 * Math.atan(0.75)
    expect(result.rooms[0]!.area).toBeCloseTo(20 + (r * r * (turn - Math.sin(turn))) / 2, 6)
    const windows = bayWindows(plan)
    expect(windows.map((o) => o.id)).toEqual(['living-bay-1', 'living-bay-2', 'living-bay-3'])
    expect(windows.every((o) => o.wall === bay.id && o.type === 'window')).toBe(true)
    // The middle one is centred on the curve, the outer two mirror each other.
    const L = wallLength(bay)
    expect(windows[1]!.offset + windows[1]!.width / 2).toBeCloseTo(L / 2, 3)
    expect(windows[0]!.offset).toBeCloseTo(L - windows[2]!.offset - windows[2]!.width, 3)
    // With no width stated they share the curve, a pier at each end, clear of the walls that meet it.
    expect(windows[1]!.width).toBeCloseTo((r * turn - 4 * limit('bayWindowPier')) / 3, 3)
    expect(windows[0]!.width).toBeLessThan(windows[1]!.width)
  })

  it('writes a canted bay as a front and two cheeks at 45 degrees, a window in each', () => {
    const { plan, result } = written(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows 3\n`)
    const [west, front, east] = ['living-bay-wall-1', 'living-bay-wall-2', 'living-bay-wall-3'].map((id) => wall(plan, id))
    for (const w of [west!, front!, east!]) expect(w.arc).toBeUndefined()
    expect(front!.start[1]).toBeCloseTo(-0.6 - 0.15, 6)
    expect(front!.end[1]).toBeCloseTo(-0.6 - 0.15, 6)
    const slope = (w: FloorPlan['walls'][number]) => Math.abs((w.end[1] - w.start[1]) / (w.end[0] - w.start[0]))
    expect(slope(west!)).toBeCloseTo(1, 6)
    expect(slope(east!)).toBeCloseTo(1, 6)
    // The front is the width less a cheek's run at each end; the bay adds a trapezium.
    expect(result.rooms[0]!.area).toBeCloseTo(20 + ((2.4 + 1.2) / 2) * 0.6, 6)
    expect(bayWindows(plan).map((o) => [o.id, o.wall])).toEqual([
      ['living-bay-1', 'living-bay-wall-1'],
      ['living-bay-2', 'living-bay-wall-2'],
      ['living-bay-3', 'living-bay-wall-3'],
    ])
    const one = written(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows 1\n`).plan
    expect(bayWindows(one).map((o) => o.wall)).toEqual(['living-bay-wall-2'])
    // No windows written, none made; its walls are there all the same.
    const none = written(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted\n`).plan
    expect(bayWindows(none)).toEqual([])
    expect(none.walls.filter((w) => w.id.startsWith('living-bay-wall'))).toHaveLength(3)
  })

  it('places the bay along the side, takes a cheek angle and a window width, and works on any side', () => {
    const { plan } = written(`${LIVING}bay in living south, 0.5 from west, 2 wide, 0.8 deep, canted 60, windows 3 0.3 wide\n`)
    const cheek = wall(plan, 'living-bay-wall-1')
    const front = wall(plan, 'living-bay-wall-2')
    // The cheek leaves the room's inside face 0.5 m from its west corner and turns 60 degrees.
    const turned = Math.atan2(Math.abs(cheek.end[1] - cheek.start[1]), Math.abs(cheek.end[0] - cheek.start[0]))
    expect((turned * 180) / Math.PI).toBeCloseTo(60, 1)
    expect(front.start[1]).toBeCloseTo(-0.8 - 0.15, 6)
    expect(bayWindows(plan).every((o) => o.width === 0.3)).toBe(true)
    const fromEast = written(`${LIVING}bay in living south, 0.5 from east, 2 wide, 0.5 deep, canted\n`).plan
    expect(Math.max(...wall(fromEast, 'living-bay-wall-3').start.concat(wall(fromEast, 'living-bay-wall-3').end).filter((_, i) => i % 2 === 0))).toBeCloseTo(3.5 + 0.15 * Math.tan(Math.PI / 8), 3)
    const east = written(`${LIVING}bay in living east, 2.4 wide, 0.9 deep, curved, windows 2\n`).plan
    const arc = wall(east, 'living-bay-wall')
    expect(arc.arc!.centre[0]).toBeCloseTo(4 + 0.9 - 1.25, 6)
    expect(bayWindows(east)).toHaveLength(2)
  })

  it('names a second bay on the same room by its number, and keeps a parking bay line a parking bay', () => {
    const { plan } = written('room living "Living" living 8 x 5 at 0,0\nbay in living south, 1 from west, 2 wide, 0.6 deep, canted, windows 1\nbay in living south.3, 1 from east, 2 wide, 0.6 deep, curved, windows 1\n')
    expect(bayWindows(plan).map((o) => o.id)).toEqual(['living-bay-1', 'living-bay2-1'])
    expect(wall(plan, 'living-bay2-wall').arc).toBeDefined()
    const parked = compileRoomsText('room park "Parking" parking 10 x 6 at 0,0\nbay p1 at 1,1, 2.4 x 4.8\n')
    expect(parked.problems).toEqual([])
    expect(safeParseFloorPlan(parked.plan)!.bays?.map((b) => b.id)).toEqual(['p1'])
  })

  it('refuses a bay it cannot build, saying why', () => {
    expect(refused('bay in living south, 2.4 wide, 0.9 deep, curved\n')).toContain("no room 'living'")
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.9 deep\n`)).toContain("'curved', an arc, or 'canted'")
    expect(refused(`${LIVING}bay in living south, 2.4 wide, curved\n`)).toContain('its width and its depth')
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.9 deep, curved, glazed\n`)).toContain("'glazed' is not read on a bay line")
    expect(refused(`${LIVING}bay in living ne, 2.4 wide, 0.9 deep, curved\n`)).toContain('rooms/no-side')
    expect(refused(`${LIVING}bay in living south, 4.4 wide, 0.9 deep, curved\n`)).toContain('which is 4.00 m long')
    expect(refused(`${LIVING}bay in living south, 3 from west, 2 wide, 0.5 deep, curved\n`)).toContain('from 3.00 to 5.00 m')
    expect(refused(`${LIVING}bay in living south, 2 wide, 1.2 deep, curved\n`)).toContain('at most 1.00 m deep')
    expect(refused(`${LIVING}bay in living south, 2 wide, 1 deep, canted\n`)).toContain('leaves no front')
    expect(refused(`${LIVING}bay in living south, 2 wide, 0.5 deep, canted 90\n`)).toContain('less than 90 degrees')
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows 2\n`)).toContain("'windows 3', one in each facet")
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows three\n`)).toContain("not 'three'")
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.9 deep, curved, windows 3 1.5 wide\n`)).toContain("do not fit along the bay's curve")
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows 3 2 wide\n`)).toContain('does not fit a facet')
    // A window the walls meeting its facet leave no room for, and a stretch of side too short for its wall.
    expect(refused(`${LIVING}bay in living south, 2.4 wide, 0.6 deep, canted, windows 3 0.7 wide\n`)).toContain('clear of the walls that meet it')
    expect(refused(`${LIVING}bay in living south, 0.1 from west, 2 wide, 0.5 deep, curved\n`)).toContain('leaves 0.10 m')
    // At the corner it starts the side there.
    expect(written(`${LIVING}bay in living south, 0 from west, 2.4 wide, 0.8 deep, canted, windows 3\n`).plan.walls.find((w) => w.id === 'living-bay-wall-1')).toBeDefined()
    // A bay is a line of the plan, not of a unit placed many times.
    expect(refused('unit u\nroom a "A" living 4 x 5 at 0,0\nbay in a south, 2 wide, 0.5 deep, curved\nend\nplace u as A at 0,0\n')).toContain("not 'bay'")
  })

  it('reads back as the text while it still writes the plan, and as the same plan without it', () => {
    const text = `plan "Terrace"\n${LIVING}room hall "Hall" corridor 2.4 x 5 east of living\nbay in living south, 2.4 wide, 0.9 deep, curved, windows 3\nbay in hall north, 1.6 wide, 0.4 deep, canted, windows 1\n`
    const { plan } = written(text)
    const file = { ...plan, walls: plan.walls.map(statedWall), openings: plan.openings.map(statedOpening), written: stampFor(plan, text) }
    const kept = readRoomsText(safeParseFloorPlan(JSON.parse(JSON.stringify(file)))!)
    expect(kept.kept).toBe(true)
    expect(kept.text).toContain('bay in living south, 2.4 wide, 0.9 deep, curved, windows 3')
    // Without the text, the reading is worked out from the plan and writes it again.
    const plain = readRoomsText(plan)
    const again = safeParseFloorPlan(compileRoomsText(plain.text).plan)!
    const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(byId(again.walls)).toEqual(byId(plan.walls))
    expect(byId(again.openings)).toEqual(byId(plan.openings))
  })
})
