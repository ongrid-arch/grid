/**
 * ARE-35: only the floor of a level that lies over an open stair below comes off its net area; a
 * landing or the half flight of a split level beside the stair below counts on the level it serves.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { door, exterior, room, wall } from '../../test-support/plans'
import { MEASURES, planAreaFigures, type FloorAreaFigures } from '../areas'

/**
 * Floors of 8 × 4 m, each with a 2 m stair room between two partitions starting at `starts[i]`:
 * the stair steps east floor by floor, as the half flights of a split level step aside. Outside
 * walls 0.2 m, partitions 0.1 m, so each stair room is 1.9 × 3.8 m inside.
 */
function steppedStair(starts: readonly number[], use: 'stair' | 'lift' = 'stair'): FloorPlan {
  const floors = starts.map((_, i) => ({ id: `f${i}`, name: `Level ${i}`, level: i }))
  const walls: Wall[] = []
  const rooms: Room[] = []
  const openings: Opening[] = []
  starts.forEach((a, i) => {
    const f = `f${i}`
    const b = a + 2
    const on = { floor: f }
    walls.push(
      exterior(`${f}-s1`, [0, 0], [a, 0], on),
      exterior(`${f}-s2`, [a, 0], [b, 0], on),
      exterior(`${f}-s3`, [b, 0], [8, 0], on),
      exterior(`${f}-e`, [8, 0], [8, 4], on),
      exterior(`${f}-n3`, [8, 4], [b, 4], on),
      exterior(`${f}-n2`, [b, 4], [a, 4], on),
      exterior(`${f}-n1`, [a, 4], [0, 4], on),
      exterior(`${f}-w`, [0, 4], [0, 0], on),
      wall(`${f}-pa`, [a, 0], [a, 4], on),
      wall(`${f}-pb`, [b, 0], [b, 4], on)
    )
    rooms.push(
      { ...room(`${f}-west`, 'West room', [`${f}-s1`, `${f}-pa`, `${f}-n1`, `${f}-w`], f), use: 'living' },
      { ...room(`${f}-stair`, 'Stair', [`${f}-s2`, `${f}-pb`, `${f}-n2`, `${f}-pa`], f), use },
      { ...room(`${f}-east`, 'East room', [`${f}-s3`, `${f}-e`, `${f}-n3`, `${f}-pb`], f), use: 'bedroom' }
    )
    openings.push(door(`${f}-da`, `${f}-pa`, 1.5), door(`${f}-db`, `${f}-pb`, 1.5))
  })
  openings.push(door('front', 'f0-s1', 1))
  return { version: '1', units: 'm', floors, walls, rooms, openings }
}

const STAIR = 1.9 * 3.8
// Moved 0.8 m east, the stair rooms share 1.1 m of their 1.9 m width: more than half, so joined.
const OVER = 1.1 * 3.8
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const externalGap = (f: FloorAreaFigures): number => f.grossExternal! - (f.net + f.overStairs + f.outsideRooms + f.walls! + f.unclaimed! - f.offSpace!)
const stairOf = (f: FloorAreaFigures) => f.rooms.find((r) => r.id === `${f.floor}-stair`)!

describe('ARE-35 a stair that steps aside level by level loses only the floor over the stair below', () => {
  const areas = planAreaFigures(steppedStair([3, 3.8, 4.6]))
  const [f0, f1, f2] = areas.floors

  it('takes off only the part over the open stair below, and counts the rest on its own level', () => {
    expect(stairOf(f0!).area).toBeCloseTo(STAIR, 9)
    expect(stairOf(f0!).overStair).toBeUndefined()
    for (const [f, below] of [[f1!, 'f0'], [f2!, 'f1']] as const) {
      const stair = stairOf(f)
      expect(stair.countedWith).toBeUndefined()
      expect(stair.overStair).toEqual({ area: expect.closeTo(OVER, 9), floor: below, room: `${below}-stair` })
      expect(stair.area).toBeCloseTo(STAIR - OVER, 9)
      expect(f.byUse['stair']).toBeCloseTo(STAIR - OVER, 9)
      expect(f.overStairs).toBeCloseTo(OVER, 9)
    }
    // Every level's rooms, less the two parts over a stair below.
    const drawn = (f: FloorAreaFigures): number => sum(f.rooms.map((r) => r.area + (r.overStair?.area ?? 0)))
    expect(areas.net.area).toBeCloseTo(sum(areas.floors.map(drawn)) - 2 * OVER, 9)
  })

  it('keeps the gross figures whole, so each floor still adds up', () => {
    for (const f of areas.floors) expect(Math.abs(externalGap(f))).toBeLessThan(1e-6)
  })

  it('says what it took off, and the net rule says the rule', () => {
    expect(areas.notes).toContain(
      `"Stair" on "Level 1" lies partly over the open stair "Stair" on "Level 0": only the ${OVER.toFixed(2)} m² over it is taken off its net area, ` +
        `and the other ${(STAIR - OVER).toFixed(2)} m² counts on "Level 1", the level it serves; the gross figures still hold it all.`
    )
    expect(areas.notes.filter((note) => note.includes('lies partly over'))).toHaveLength(2)
    expect(areas.notes.some((note) => note.includes('rises through'))).toBe(false)
    expect(MEASURES.net.measures).toContain('only the part of a stair or lift room that lies over the one below is taken off')
    expect(MEASURES.net.measures).toContain('a half flight of a split level')
  })

  it('counts a lift shaft that steps aside the same way', () => {
    const lift = planAreaFigures(steppedStair([3, 3.8], 'lift'))
    expect(stairOf(lift.floors[1]!).overStair?.area).toBeCloseTo(OVER, 9)
    expect(lift.notes.some((note) => note.includes('lies partly over the lift shaft'))).toBe(true)
  })
})

describe('ARE-35 a stair room wholly over the one below is still counted once, below', () => {
  it('counts a stack that lines up on the floor it rises from, as before', () => {
    const areas = planAreaFigures(steppedStair([3, 3, 3]))
    for (const f of areas.floors.slice(1)) {
      expect(stairOf(f).countedWith).toEqual({ floor: 'f0', room: 'f0-stair' })
      expect(stairOf(f).overStair).toBeUndefined()
      expect(stairOf(f).area).toBeCloseTo(STAIR, 9)
      expect(f.overStairs).toBeCloseTo(STAIR, 9)
    }
  })

  it('counts a room wholly over a stair that stepped aside with that stair, not the one under it', () => {
    // Level 1 steps aside from level 0; level 2 lines up with level 1.
    const areas = planAreaFigures(steppedStair([3, 3.8, 3.8]))
    const [, f1, f2] = areas.floors
    expect(stairOf(f1!).overStair?.area).toBeCloseTo(OVER, 9)
    expect(stairOf(f2!).countedWith).toEqual({ floor: 'f1', room: 'f1-stair' })
    expect(f2!.overStairs).toBeCloseTo(STAIR, 9)
    expect(f2!.byUse['stair']).toBeUndefined()
  })
})
