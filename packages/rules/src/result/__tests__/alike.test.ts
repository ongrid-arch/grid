/**
 * MSG-36: a note the same on many parts or floors is one line of the record, with every part in
 * `each` and every id in `also`; a note that differs in a figure stays a line of its own.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { door, flat } from '@ongrid/floorplan/test-support/plans'
import { holdsOnFloor, inspectPlan } from '../..'

/** The flat with a doorless bathroom and a door laid over the kitchen's, copied `n` times, each copy `place`d. */
function copies(n: number, place: (i: number) => { floor: string; prefix: string; dx: number }): FloorPlan {
  const one = flat()
  one.openings = one.openings.filter((o) => o.id !== 'd_bb')
  one.openings.push(door('d_x', 'hk', 2.3))
  const at = Array.from({ length: n }, (_, i) => place(i))
  const floors = [...new Set(at.map((a) => a.floor))]
  const moved = (p: [number, number], dx: number): [number, number] => [p[0] + dx, p[1]]
  return {
    ...one,
    floors: floors.map((f, i) => ({ id: f, name: f, level: i })),
    walls: at.flatMap(({ floor, prefix, dx }) => one.walls.map((w) => ({ ...w, id: prefix + w.id, floor, start: moved(w.start, dx), end: moved(w.end, dx) }))),
    rooms: at.flatMap(({ floor, prefix }) => one.rooms.map((r) => ({ ...r, id: prefix + r.id, boundary: r.boundary.map((b) => prefix + b), floor }))),
    openings: at.flatMap(({ prefix }) => one.openings.map((o) => ({ ...o, id: prefix + o.id, wall: prefix + o.wall })))
  }
}

const level = (i: number): string => `l${String(i).padStart(2, '0')}`
const tower = (n: number): FloorPlan => copies(n, (i) => ({ floor: level(i), prefix: `${level(i)}-`, dx: 0 }))

describe('a note the same on every floor', () => {
  it('is one line that names the floors, every part kept', () => {
    const result = inspectPlan(tower(5))
    const overlap = result.lines.filter((l) => l.code === 'opening/overlap')
    expect(overlap.map((l) => l.message)).toEqual(['Door "l00-d_x" overlaps another opening on its wall (the same on 5 floors: "l00" to "l04")'])
    expect(overlap[0]!.each).toEqual([0, 1, 2, 3, 4].map((i) => ({ kind: 'opening', id: `${level(i)}-d_x` })))
    expect(overlap[0]!.also).toEqual(['l01-d_x', 'l02-d_x', 'l03-d_x', 'l04-d_x'])
    const doorless = result.lines.filter((l) => l.code === 'room/no-door')
    expect(doorless.map((l) => l.message)).toEqual(['"Bathroom" has no door or opening to another space (the same on 5 floors: "l00" to "l04")'])
    // A line about a floor lists the floors; what it holds back is kept for each.
    const notDrawn = result.lines.filter((l) => l.code === 'floor/not-checked-doors-not-drawn')
    expect(notDrawn).toHaveLength(1)
    expect(notDrawn[0]!.each).toHaveLength(5)
    expect(notDrawn[0]!.also).toEqual(expect.arrayContaining(['l00-d_x', 'l04', 'l04-d_x']))
    // The count and the problems count each such note once.
    expect(result.count).toBe(result.lines.length)
    expect(result.problems).toBe(result.lines.filter((l) => l.causedBy === undefined && l.kind !== 'not-checked').length)
  })

  it('names the floors it holds for, so a view of each floor finds it', () => {
    const lines = inspectPlan(tower(5)).lines
    const overlap = lines.find((l) => l.code === 'opening/overlap')!
    expect(overlap.floor).toBe('l00')
    expect(overlap.floors).toEqual([0, 1, 2, 3, 4].map(level))
    for (const i of [0, 1, 2, 3, 4]) expect(holdsOnFloor(overlap, level(i))).toBe(true)
    expect(holdsOnFloor(overlap, 'l05')).toBe(false)
    // A line on one floor names no floors, and a line about the plan holds on every floor.
    expect(holdsOnFloor({ floor: 'l01' }, 'l01')).toBe(true)
    expect(holdsOnFloor({ floor: 'l01' }, 'l02')).toBe(false)
    expect(holdsOnFloor({ floor: null }, 'l02')).toBe(true)
  })

  it('stays one line per floor on two floors', () => {
    expect(inspectPlan(tower(2)).lines.filter((l) => l.code === 'opening/overlap')).toHaveLength(2)
  })

  it('stays apart where a figure differs', () => {
    // A door out above the ground is said with its own height on each floor.
    const out = inspectPlan(tower(5)).lines.filter((l) => l.code === 'opening/door-out-above-ground')
    expect(out).toHaveLength(4)
    expect(out.every((l) => l.each === undefined)).toBe(true)
  })

  it('is said in the record\'s language', async () => {
    await loadLanguage('es')
    const line = inspectPlan(tower(4), { language: 'es' }).lines.find((l) => l.code === 'opening/overlap')!
    expect(line.message).toMatch(/\(lo mismo en 4 plantas: "l00" a "l03"\)$/)
  })
})

describe('a note the same on many parts of one floor', () => {
  it('is one line that names the parts as a run', () => {
    const ward = copies(4, (i) => ({ floor: 'ground', prefix: `w${i + 1}-`, dx: i * 12 }))
    const overlap = inspectPlan(ward).lines.filter((l) => l.code === 'opening/overlap')
    expect(overlap.map((l) => l.message)).toEqual(['Door "w1-d_x" overlaps another opening on its wall (the same for 4 openings: "w1-d_x" to "w4-d_x")'])
    expect(overlap[0]!.each).toHaveLength(4)
    // All on one floor: it names no floors.
    expect(overlap[0]!.floors).toBeUndefined()
  })

  it('names the parts and how many floors they are on when there are several on a floor', () => {
    const block = copies(6, (i) => ({ floor: level(i % 2), prefix: `u${i + 1}-`, dx: Math.floor(i / 2) * 12 }))
    const overlap = inspectPlan(block).lines.filter((l) => l.code === 'opening/overlap')
    expect(overlap.map((l) => l.message)).toEqual(['Door "u1-d_x" overlaps another opening on its wall (the same for 6 openings on 2 floors: "u1-d_x" to "u6-d_x")'])
  })
})
