/**
 * WRT-40: the read-back writes on its walls line a height walls state themselves, never the
 * height a wall takes from its floor's roof, so writing the read-back again changes no wall.
 */
import { describe, expect, it } from 'vitest'
import { heightStated, parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

/** A nave 14 m to its eaves under a gable whose ridge is at 38 m, over a crypt. */
function cathedral(crypt: string): FloorPlan {
  const text = [
    'walls outside 0.6 inside 0.3',
    'floor ground "Nave" height 14',
    'room n "Nave" living 30 x 12 at 0,0',
    'room a "Aisle" living 30 x 6 north of n',
    `floor crypt "Crypt" level -1${crypt}`,
    'room c "Crypt" living 10 x 8 at 0,0',
    '',
  ].join('\n')
  const compiled = compileRoomsText(text)
  expect(compiled.problems).toEqual([])
  const raw = JSON.parse(JSON.stringify(compiled.plan)) as { floors: { id: string; roof?: unknown }[] }
  raw.floors.find((f) => f.id === 'ground')!.roof = { shape: 'gable', eaves: 14, ridge: 38 }
  return parseFloorPlan(raw)
}

function writtenAgain(text: string): FloorPlan {
  const compiled = compileRoomsText(text)
  expect(compiled.problems).toEqual([])
  return parseFloorPlan(compiled.plan)
}

function expectSameWalls(plan: FloorPlan, again: FloorPlan): void {
  expect(again.walls.map((w) => w.id).sort()).toEqual(plan.walls.map((w) => w.id).sort())
  for (const w of plan.walls) {
    const g = again.walls.find((x) => x.id === w.id)!
    expect([g.id, g.height, heightStated(g)]).toEqual([w.id, w.height, heightStated(w)])
  }
}

describe("the read-back's wall height on a floor under a roof", () => {
  it("does not write the roof's ridge as the walls' height", () => {
    const plan = cathedral('')
    // The nave's walls rise to the ridge as read; none states a height of its own.
    expect(plan.walls.filter((w) => w.floor !== 'crypt').every((w) => w.height === 38 && !heightStated(w))).toBe(true)
    const reading = readRoomsText(plan)
    const wallsLine = reading.text.split('\n').find((line) => line.startsWith('walls '))
    expect(wallsLine).toBe('walls outside 0.6 inside 0.3')
    expect(reading.text).not.toContain('height 38')
  })

  it('keeps a floor whose walls state no height in rooms text, and writing it again changes no wall', () => {
    const plan = cathedral('')
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expectSameWalls(plan, writtenAgain(reading.text))
  })

  it('asked for rooms first, says writing it again changes nothing', () => {
    const reading = readRoomsText(cathedral(''), { prefer: 'rooms' })
    expect(reading.changes).toEqual([])
  })

  it('still writes a height the walls state themselves', () => {
    const plan = cathedral(' height 3')
    const raw = JSON.parse(JSON.stringify(plan)) as { walls: { floor?: string; height?: number; unstated?: unknown }[]; floors: { id: string; height?: number }[] }
    // The crypt's walls state 3.2 of their own, its floor none.
    delete raw.floors.find((f) => f.id === 'crypt')!.height
    for (const w of raw.walls) {
      delete w.unstated
      if (w.floor === 'crypt') w.height = 3.2
      else delete w.height
    }
    const stated = parseFloorPlan(raw)
    const reading = readRoomsText(stated)
    expect(reading.text.split('\n').find((line) => line.startsWith('walls '))).toBe('walls outside 0.6 inside 0.3 height 3.2')
    expect(reading.rawFloors).toEqual([])
    expectSameWalls(stated, writtenAgain(reading.text))
  })
})
