import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomNumbers, shownRoomNumber } from '@ongrid/floorplan/geometry'
import { toIfc } from '@ongrid/floorplan/geometry/export/ifc'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-23: an edit that would move the number a room had writes the numbers the rooms had, so the
 * schedule and the IFC spaces keep them; one that moves none writes none.
 */
const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures/edits')
const flat = JSON.parse(readFileSync(resolve(FIXTURES, 'flat-v04.json'), 'utf8')) as Record<string, unknown>

let b: Bench
beforeAll(() => {
  b = bench({ 'flat.json': flat })
})
afterAll(() => b.close())

const written = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(b.folder, file), 'utf8')))
const shown = (plan: FloorPlan): Map<string, string> => new Map(roomNumbers(plan).map((n) => [n.id, shownRoomNumber(n)] as const))
const spaceNames = (plan: FloorPlan): string[] => [...toIfc(plan).matchAll(/IFCSPACE\('[^']*',#\d+,'([^']*)'/g)].map((m) => m[1]!).sort()

describe('room numbers an edit keeps (WRT-23)', () => {
  it('adding a room leaves every other room its number, in the schedule and in the IFC', async () => {
    const before = parseFloorPlan(flat)
    const had = shown(before)
    const reply = await b.call('grid_add_room', {
      plan: 'flat.json', room: 'extension', name: 'Garden room', use: 'living', against: 'living', side: 'south', width: 3, depth: 4, size: 'centre',
      from: 'west', distance: 0.8, in_the_way: 'remove', out: 'added.json',
    })
    expect(reply.isError, reply.text).toBe(false)
    const after = written('added.json')
    const now = shown(after)
    for (const [id, number] of had) expect(now.get(id), id).toBe(number)
    expect(now.get('extension')).toBe(String(had.size + 1))
    const names = spaceNames(after)
    for (const number of had.values()) expect(names).toContain(number)
    expect(names).toContain(String(had.size + 1))
  })

  it('a change that moves no number writes none', async () => {
    const reply = await b.call('grid_move_room_side', { plan: 'flat.json', room: 'living', side: 'south', by: 0.1, out: 'moved.json' })
    expect(reply.isError, reply.text).toBe(false)
    expect(written('moved.json').rooms.every((room) => room.number === undefined)).toBe(true)
  })
})
