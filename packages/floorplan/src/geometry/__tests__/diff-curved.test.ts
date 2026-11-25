/**
 * MSG-26: two versions with a curved wall compared by what stands where. A curved wall stands in
 * the same place only with its curve's centre in the same place too, so a round room whose radius
 * grew reads as grown, with its radius before and after, and never as the same building moved.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { alignPlans, compareBuildings } from '../diff'

type Tuple = [number, number]

/** One round room: one wall from a point on the circle all the way round its centre. */
function roundRoom(start: Tuple, centre: Tuple, extra: Partial<Wall> = {}): FloorPlan {
  const wall: Wall = { id: 'round', start, end: start, thickness: 0.2, height: 3, kind: 'exterior', arc: { centre, sweep: 360 }, ...extra }
  return { version: '1', units: 'm', walls: [wall], rooms: [{ id: 'round-room', name: 'Round room', boundary: [wall.id] }], openings: [] }
}

/** A room with an apse: 6 m deep, as wide as the apse, its east side a half circle; `rename` gives every wall a new id. */
function apseRoom(radius: number, shift: Tuple = [0, 0], reversed = false, rename = ''): FloorPlan {
  const p = (x: number, y: number): Tuple => [x + shift[0], y + shift[1]]
  const straight = (id: string, a: Tuple, b: Tuple): Wall => ({ id: `${id}${rename}`, start: a, end: b, thickness: 0.2, height: 3, kind: 'exterior' })
  const apse: Wall = reversed
    ? { id: `apse${rename}`, start: p(6, 2 * radius), end: p(6, 0), thickness: 0.2, height: 3, kind: 'exterior', arc: { centre: p(6, radius), sweep: -180 } }
    : { id: `apse${rename}`, start: p(6, 0), end: p(6, 2 * radius), thickness: 0.2, height: 3, kind: 'exterior', arc: { centre: p(6, radius), sweep: 180 } }
  const walls = [
    straight('south', p(0, 0), p(6, 0)),
    apse,
    straight('north', p(6, 2 * radius), p(0, 2 * radius)),
    straight('west', p(0, 2 * radius), p(0, 0))
  ]
  return { version: '1', units: 'm', walls, rooms: [{ id: 'hall', name: 'Hall', boundary: walls.map((w) => w.id) }], openings: [] }
}

describe('a round room whose radius grew (MSG-26)', () => {
  const before = roundRoom([8, 5], [5, 5])
  const after = roundRoom([9, 5], [5, 5])

  it('is not the same building, and the drawing has not moved', () => {
    const compared = compareBuildings(before, after)
    expect(compared.sameBuilding).toBe(false)
    expect(compared.shift).toEqual([0, 0])
    expect(compared.verdict).not.toContain('sits')
  })

  it('reads as grown, with its radius before and after', () => {
    const compared = compareBuildings(before, after)
    const room = compared.rooms.find((r) => r.room === 'round-room')!
    expect(room.status).toBe('changed')
    expect(room.before).toBeCloseTo(Math.PI * 2.9 * 2.9, 1)
    expect(room.after).toBeCloseTo(Math.PI * 3.9 * 3.9, 1)
    expect(room.walls).toEqual(['round'])
    expect(room.text).toBe('"Round room" 26.42 m² → 47.78 m², because curved wall "round" went from a radius of 3.00 to 4.00 m')
    expect(compared.changes.map((c) => c.text)).toContain('Wall "round" radius 3.00 → 4.00 m, by "Round room"')
  })

  it('says a radius that shrank the same way', () => {
    const room = compareBuildings(after, before).rooms.find((r) => r.room === 'round-room')!
    expect(room.text).toBe('"Round room" 47.78 m² → 26.42 m², because curved wall "round" went from a radius of 4.00 to 3.00 m')
  })
})

describe('a curved wall pairs by place only with its centre in place (MSG-26)', () => {
  it('pairs a round room moved as it was, its centre moved with it', () => {
    const compared = compareBuildings(roundRoom([8, 5], [5, 5]), roundRoom([9, 5], [6, 5], { id: 'ring' }))
    expect(compared.sameBuilding).toBe(true)
    expect(compared.shift[0]).toBeCloseTo(1, 9)
    expect(compared.shift[1]).toBeCloseTo(0, 9)
    expect(compared.changes).toEqual([])
  })

  it('does not pair a curved wall with one whose ends stand in its place round another centre', () => {
    const alignment = alignPlans(roundRoom([8, 5], [5, 5]), roundRoom([8, 5], [4, 5], { id: 'ring' }))
    expect(alignment.walls.get('round')).toBeUndefined()
  })

  it('takes the shifted origin from the curve, not only its ends', () => {
    // The apse reaches 3 m east of its ends; the low corner is the square's, so moving the whole room pairs every wall.
    const compared = compareBuildings(apseRoom(3), apseRoom(3, [2.5, -1.5]))
    expect(compared.sameBuilding).toBe(true)
    expect(compared.changes).toEqual([])
  })

  it('pairs a curved wall drawn the other way round as the same curve', () => {
    const compared = compareBuildings(apseRoom(3), apseRoom(3, [0, 0], true, '-2'))
    expect(compared.sameBuilding).toBe(true)
    expect(compared.changes).toEqual([])
  })

  it('reads an apse that grew as grown, with its radius', () => {
    const compared = compareBuildings(apseRoom(3), apseRoom(4))
    expect(compared.sameBuilding).toBe(false)
    const hall = compared.rooms.find((r) => r.room === 'hall')!
    expect(hall.status).toBe('changed')
    expect(hall.text).toContain('curved wall "apse" went from a radius of 3.00 to 4.00 m')
  })
})
