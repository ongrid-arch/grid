/**
 * WRT-37: the walls rooms text works out keep their ids when a building that shares no wall with
 * them is added elsewhere on the floor, so an opening pattern naming one still places its openings.
 */
import { describe, expect, it } from 'vitest'
import { expandPatterns } from '../../geometry/patterns'
import { parseFloorPlan, type FloorPlan, type OpeningPattern } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

function written(text: string): FloorPlan {
  const out = compileRoomsText(text)
  expect(out.problems).toEqual([])
  return parseFloorPlan(out.plan)
}

const shed = [
  'walls outside 0.3 inside 0.1 height 6',
  'room hall "Loading hall" storage 40 x 20 at 0,0',
  'room office "Office" office 6 x 4 north of hall',
]
const pumpHouse = 'room pump "Pump house" plant 3 x 3 at 50,0'
const store = ['room store "Store" storage 4 x 4 at 0,40', 'room tank "Tank room" plant 3 x 4 east of store']

const dock: OpeningPattern = { id: 'dock', wall: 'ext-south', opening: { type: 'door', width: 3, sill: 0, height: 4 }, spacing: 5, margins: { start: 1 } }
const wallIds = (plan: FloorPlan): Map<string, string> => new Map(plan.walls.map((w) => [w.id, `${w.start.join(',')} ${w.end.join(',')}`]))

describe('derived wall ids when a building is added elsewhere (WRT-37)', () => {
  it('keeps every wall id of the first building, in the same place, when a detached one is added', () => {
    const alone = written(shed.join('\n'))
    const withPump = written([...shed, pumpHouse].join('\n'))
    const withBoth = written([...shed, pumpHouse, ...store].join('\n'))
    for (const plan of [withPump, withBoth]) {
      const after = wallIds(plan)
      for (const [id, at] of wallIds(alone)) expect(after.get(id), id).toBe(at)
    }
    // The pump house is there too, and kept as it was when the store came after it.
    const pump = [...wallIds(withPump)].filter(([id]) => !wallIds(alone).has(id))
    expect(pump.length).toBeGreaterThan(0)
    for (const [id, at] of pump) expect(wallIds(withBoth).get(id), id).toBe(at)
  })

  it("names another building's outside walls by its first room, and no id twice", () => {
    const plan = written([...shed, pumpHouse, ...store].join('\n'))
    const ids = plan.walls.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['ext-south', 'ext-pump-south', 'ext-pump-north', 'ext-store-south', 'w-store-tank']))
    // The first building's one south wall is never numbered because another building has one.
    expect(ids.filter((id) => id.startsWith('ext-south-'))).toEqual([])
  })

  it('keeps a pattern on the first building placing the same doors when a detached one is added', () => {
    const doors = (text: string): string[] => {
      const expansion = expandPatterns({ ...written(text), patterns: [dock] })
      expect(expansion.issues).toEqual([])
      return expansion.plan.openings.map((o) => `${o.id} ${o.wall} ${o.offset}`)
    }
    const alone = doors(shed.join('\n'))
    expect(alone.length).toBeGreaterThan(5)
    expect(doors([...shed, pumpHouse].join('\n'))).toEqual(alone)
  })

  it('reads a plan of two buildings back as rooms text that writes the same walls again', () => {
    const plan = written([...shed, pumpHouse, ...store].join('\n'))
    const read = readRoomsText(plan)
    const again = written(read.text)
    expect([...wallIds(again)]).toEqual([...wallIds(plan)])
  })
})
