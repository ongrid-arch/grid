/**
 * WRT-20: a floor added or removed is said in one line, with its rooms and their area, and the
 * rooms of the floor the plan had are not said to have moved to it.
 *
 * The house is written rooms first, once with no floor line (its rooms state no floor: the ground
 * floor, C5) and once with a `floor ground` line and a first floor copied from it.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { registerMessages, say } from '../../messages/say'
import { es } from '../../messages/es'
import { planAreaFigures } from '../areas'
import { areaText } from '../rounding'
import { compareBuildings } from '../diff'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

const GROUND = `room living  "Living"  living  2.8 x 4.7 at 0.15,0.15
room kitchen "Kitchen" kitchen 2.8 x 4.7 east of living
door door in living south, 0.85 from west, 0.9 wide, opens in, hinged west
`
const HEAD = `plan "House"
walls outside 0.3 inside 0.1 height 2.7
`
const oneFloor = `${HEAD}
${GROUND}`
const twoFloors = `${HEAD}
floor ground "Ground floor" level 0
${GROUND}
floor first "First floor" level 1 height 2.5
copy ground
rename living bed "Bedroom" bedroom
rename kitchen bath "Bath" -
`

const firstNet = (plan: FloorPlan): string => areaText(planAreaFigures(plan).floors.find((f) => f.floor === 'first')!.net)

describe('a floor added (lab: every ground-floor room was said to have moved to floor "ground")', () => {
  const before = written(oneFloor)
  const after = written(twoFloors)
  const compared = compareBuildings(before, after)

  it('leaves the rooms of the floor the plan had as they were', () => {
    expect(before.rooms.every((r) => r.floor === undefined)).toBe(true)
    expect(after.rooms.find((r) => r.id === 'living')?.floor).toBe('ground')
    const ground = compared.rooms.filter((r) => r.room === 'living' || r.room === 'kitchen')
    expect(ground.map((r) => r.status)).toEqual(['unchanged', 'unchanged'])
    expect(compared.verdict).not.toContain('moved to floor')
    expect(compared.changes.map((l) => l.text).join('\n')).not.toContain('moved to floor')
  })

  it('says the floor first, with its rooms and their net area', () => {
    const line = `Floor added: "First floor", 2 rooms, ${firstNet(after)} m²`
    expect(compared.changes[0]?.text).toBe(line)
    expect(compared.changes[0]?.entities).toEqual([{ type: 'floor', id: 'first' }])
    expect(compared.verdict).toMatch(new RegExp(`^\\d+ changes, room by room: ${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}; 2 rooms as they were`))
    // The rooms on it keep their own lines and verdicts, and the verdict does not say them again.
    expect(compared.rooms.filter((r) => r.status === 'added').map((r) => r.name).sort()).toEqual(['Bath', 'Bedroom'])
    expect(compared.changes.some((l) => l.text.startsWith('Room added: "Bedroom"'))).toBe(true)
    expect(compared.verdict).not.toContain('Room added')
    expect(compared.verdict).not.toContain('wall or opening change')
  })

  it('says the floor removed the other way round, from the earlier plan', () => {
    const back = compareBuildings(after, before)
    expect(back.changes[0]?.text).toBe(`Floor removed: "First floor", 2 rooms, ${firstNet(after)} m²`)
    expect(back.rooms.filter((r) => r.room === 'living' || r.room === 'kitchen').map((r) => r.status)).toEqual(['unchanged', 'unchanged'])
    expect(back.verdict).not.toContain('moved to floor')
    expect(back.verdict).not.toContain('Room removed')
  })

  it('says it in Spanish from the message file', () => {
    registerMessages('es', es)
    expect(say('es', 'diff.floor.added', { floor: { name: 'Primera' }, rooms: { key: 'diff.floor.rooms.many', values: { count: 2, area: { num: '26.32' } } } })).toBe('Planta añadida: "Primera", 2 estancias, 26,32 m²')
  })
})

describe('what is still said', () => {
  it('says a room really moved to another floor', () => {
    const plan = written(twoFloors)
    const moved = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'kitchen' ? { ...r, floor: 'first' } : r)) }
    const compared = compareBuildings(plan, moved)
    expect(compared.rooms.find((r) => r.room === 'kitchen')?.text).toContain('moved to floor "first"')
  })

  it('says a floor with no rooms has none', () => {
    const plan = written(oneFloor)
    const more = { ...plan, floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'roof', name: 'Roof', level: 1 }] }
    const compared = compareBuildings(plan, more)
    expect(compared.changes.map((l) => l.text)).toEqual(['Floor added: "Roof", no rooms'])
    expect(compared.verdict).toBe('1 change, room by room: Floor added: "Roof", no rooms; 2 rooms as they were.')
  })
})
