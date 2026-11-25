/**
 * LVL-16: a copied floor takes everything of the floor it copies (its outline, roof, parapet,
 * homes and parking too), the write says when copies took no doors, a room that rises through
 * takes the doors between it and another rising room, and the floor an id is first written on
 * keeps it.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

const OUTLINE = '[[0,0],[12.3,0],[12.3,6.3],[0,6.3]]'

const tower = (copy: string): string =>
  [
    'walls outside 0.3 inside 0.15 height 2.8',
    'floor g "Ground floor" level 0',
    'room core "Stair" stair 2.6 x 5 at 0.15,0.15 through l3',
    'room lobby "Lobby" corridor 2 x 5 east of core through l3',
    'room flat "Flat" living 6.7 x 5 east of lobby',
    'door dc between core and lobby, centred, 0.9 wide',
    'door df between lobby and flat, centred, 0.9 wide',
    'door de in core west, centred, 1.0 wide',
    'window wf in flat south, centred, 1.8 wide',
    `raw floor {"outline": ${OUTLINE}, "homes": 1, "parking": 2, "parapet": 1.1, "roof": {"shape": "flat", "eaves": 2.8}}`,
    `floor l1 "First floor" level 1 ${copy}`,
    `floor l2 "Second floor" level 2 ${copy}`,
    `floor l3 "Third floor" level 3 ${copy}`,
  ].join('\n')

describe('a copied floor takes the floor fields of the floor it copies (LVL-16)', () => {
  it('copies the outline, roof, parapet, homes and parking to every copy', () => {
    const plan = written(tower('copy g with openings'))
    for (const id of ['l1', 'l2', 'l3']) {
      const floor = plan.floors!.find((f) => f.id === id)!
      expect(floor.outline).toEqual(JSON.parse(OUTLINE))
      expect([floor.homes, floor.parking, floor.parapet]).toEqual([1, 2, 1.1])
      expect(floor.roof).toMatchObject({ shape: 'flat', eaves: 2.8 })
    }
    expect(plan.floors!.reduce((n, f) => n + (f.homes ?? 0), 0)).toBe(4)
  })

  it('lets a raw floor line on the copy set a field, before or after the copy, and null take one off', () => {
    const text = tower('copy g with openings')
      .replace('floor l2 "Second floor" level 2 copy g with openings', 'floor l2 "Second floor" level 2\nraw floor {"homes": 3}\ncopy g with openings')
      .replace('floor l3 "Third floor" level 3 copy g with openings', 'floor l3 "Third floor" level 3 copy g with openings\nraw floor {"roof": null, "parking": 0}')
    const plan = written(text)
    const floor = (id: string) => plan.floors!.find((f) => f.id === id)!
    expect(floor('l2').homes).toBe(3)
    expect(floor('l3').roof).toBeUndefined()
    expect(floor('l3').parking).toBe(0)
    expect(floor('l3').homes).toBe(1)
    expect(floor('l1').roof).toMatchObject({ shape: 'flat' })
  })

  it('never copies the level a raw floor line gave the source', () => {
    const plan = written(tower('copy g').replace('raw floor {', 'raw floor {"level": 0.25, '))
    expect(plan.floors!.map((f) => f.level)).toEqual([0.25, 1, 2, 3])
  })
})

describe('the write says when copies took no doors (LVL-16)', () => {
  it('names every copy that took none of the doors and windows of the floor it copies, in one warning', () => {
    const result = compileRoomsText(tower('copy g'))
    expect(result.problems).toEqual([])
    const warned = result.warnings.filter((w) => w.code === 'rooms/copy-no-openings')
    expect(warned).toHaveLength(1)
    expect(warned[0]!.message).toContain("'l1', 'l2' and 'l3'")
    expect(warned[0]!.message).toContain('copy g with openings')
  })

  it('says nothing of a copy with openings, or one that writes its own', () => {
    expect(compileRoomsText(tower('copy g with openings')).warnings.some((w) => w.code === 'rooms/copy-no-openings')).toBe(false)
    const own = tower('copy g').replace('floor l3 "Third floor" level 3 copy g', 'floor l3 "Third floor" level 3 copy g\nwindow w3 in flat south, centred, 1.2 wide')
    const warned = compileRoomsText(own).warnings.filter((w) => w.code === 'rooms/copy-no-openings')
    expect(warned[0]!.message).toContain("'l1' and 'l2'")
    expect(warned[0]!.message).not.toContain("'l3'")
  })

  it('names a copy of a copy that took none, by the floor it copies', () => {
    const text = tower('copy g').replace('floor l3 "Third floor" level 3 copy g', 'floor l3 "Third floor" level 3 copy l2')
    const message = compileRoomsText(text).warnings.find((w) => w.code === 'rooms/copy-no-openings')!.message
    expect(message).toContain("Floors 'l1' and 'l2' copy the rooms of floor 'g'")
    expect(message).toContain("Floor 'l3' copies the rooms of floor 'l2'")
  })
})

describe('a room that rises through takes the doors between rising rooms (LVL-16)', () => {
  it('puts the door between two rising rooms on every floor they rise through, and no door of theirs to anything else', () => {
    const plan = written(tower('copy g'))
    expect(plan.openings.map((o) => o.id).sort()).toEqual(['dc', 'de', 'df', 'l1-dc', 'l2-dc', 'l3-dc', 'wf'].sort())
    const walls = new Map(plan.walls.map((w) => [w.id, w]))
    expect(plan.openings.filter((o) => o.id.endsWith('dc')).map((o) => walls.get(o.wall)!.floor)).toEqual(['g', 'l1', 'l2', 'l3'])
  })

  it('keeps a floor its own door between the same two rooms, and lets remove take a carried one off', () => {
    const text = tower('copy g')
      .replace('floor l1 "First floor" level 1 copy g', 'floor l1 "First floor" level 1 copy g\ndoor d1 between lobby and core, 1.0 from north, 1.0 wide')
      .replace('floor l2 "Second floor" level 2 copy g', 'floor l2 "Second floor" level 2 copy g\nremove dc')
    const plan = written(text)
    const ids = plan.openings.map((o) => o.id)
    expect(ids).toContain('d1')
    expect(ids).not.toContain('l1-dc')
    expect(ids).not.toContain('l2-dc')
    expect(ids).toContain('l3-dc')
  })

  it('takes a copied floor with openings once, not again from the rising rooms', () => {
    const plan = written(tower('copy g with openings'))
    expect(plan.openings.filter((o) => o.id.endsWith('dc'))).toHaveLength(4)
  })
})

describe('the floor an id is first written on keeps it (LVL-16)', () => {
  it('leaves the source floor its ids, and gives the copies their floor in front', () => {
    const plan = written(tower('copy g with openings'))
    expect(plan.rooms.filter((r) => r.floor === 'g').map((r) => r.id)).toEqual(['core', 'lobby', 'flat'])
    expect(plan.rooms.filter((r) => r.floor === 'l2').map((r) => r.id)).toEqual(['l2-core', 'l2-lobby', 'l2-flat'])
    const warned = compileRoomsText(tower('copy g with openings')).warnings.find((w) => w.code === 'rooms/id-changed')!
    expect(warned.message).toContain("'flat' is kept on floor 'g'")
    expect(warned.message).toContain("'l1-flat' on floor 'l1'")
  })

  it('names a few floors of each id it changed, and counts the rest', () => {
    const floors = ['l1', 'l2', 'l3', 'l4', 'l5'].map((id, i) => `floor ${id} "Floor ${i + 1}" level ${i + 1} copy g with openings`)
    const text = [...tower('').split('\n').slice(0, 10).map((l) => l.replace(' through l3', ' through l5')), ...floors].join('\n')
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    const message = result.warnings.find((w) => w.code === 'rooms/id-changed')!.message
    expect(message).toContain("'flat' is kept on floor 'g' and is 'l1-flat' on floor 'l1', 'l2-flat' on floor 'l2' and 'l3-flat' on floor 'l3', and so on for 2 more;")
    expect(message).toContain("'wf' is kept on floor 'g'")
  })

  it('reads a plan written with copies back to text that writes the same plan', () => {
    const plan = written(tower('copy g with openings'))
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(JSON.stringify(written(reading.text).rooms.map((r) => r.id))).toBe(JSON.stringify(plan.rooms.map((r) => r.id)))
    expect(written(reading.text).openings.map((o) => o.id).sort()).toEqual(plan.openings.map((o) => o.id).sort())
  })

  it('reads a plan written before, with every floor\'s id in front, back with its ids as they are', () => {
    const plan = written(tower('copy g with openings'))
    const older: FloorPlan = {
      ...plan,
      rooms: plan.rooms.map((r) => (r.floor === 'g' ? { ...r, id: `g-${r.id}` } : r)),
    }
    const reading = readRoomsText(older)
    expect(reading.rawFloors).toEqual([])
    expect(written(reading.text).rooms.map((r) => r.id)).toEqual(older.rooms.map((r) => r.id))
  })
})
