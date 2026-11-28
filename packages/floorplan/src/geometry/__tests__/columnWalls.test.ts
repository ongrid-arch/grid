/**
 * ARE-80: a column standing in a door's or a window's hole, and a partition drawn on through a
 * column. A column in any other wall, or a partition stopping at one, is how a building is drawn.
 */
import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { validatePlan } from '../validate'

const square = (id: string, x: number, y: number, width = 0.4): unknown => ({ id, shape: 'square', width, at: [x, y] })
const found = (columns: unknown[], partition = false): { code: string; id: string; hits?: readonly string[]; message: string }[] => {
  const plan = flat()
  const walls = partition ? plan.walls.map((w) => (w.id === 'bb' ? { ...w, kind: 'partition' as const } : w)) : plan.walls
  return validatePlan({ ...plan, walls, columns: columns as never }).issues
    .filter((i) => i.code === 'plan/column-in-opening' || i.code === 'plan/column-in-partition')
    .map((i) => ({ code: i.code, id: i.id, hits: (i as { hits?: readonly string[] }).hits, message: i.message }))
}

describe('a column in an opening', () => {
  it('names a perimeter column drawn through a window, with the window and how far', () => {
    const issues = found([square('c1', 6.6, 0)])
    expect(issues.map((i) => [i.code, i.id, i.hits])).toEqual([['plan/column-in-opening', 'c1', ['win_k']]])
    expect(issues[0]!.message).toBe('Column "c1" stands in window "win_k", by 0.20 m: it is drawn through the glass.')
  })

  it('names a column in a doorway', () => {
    expect(found([square('c1', 4, 1.9, 0.3)]).map((i) => [i.code, i.hits])).toEqual([['plan/column-in-opening', ['d_hk']]])
  })

  it('names nothing for a column in an outside wall clear of its openings, or against a jamb', () => {
    expect(found([square('c1', 5, 0), square('c2', 5.8, 0)])).toEqual([])
  })
})

describe('a partition drawn through a column', () => {
  it('names a partition that goes on past the column both ways', () => {
    const issues = found([square('c1', 5, 7, 0.3)], true)
    expect(issues.map((i) => [i.code, i.id, i.hits])).toEqual([['plan/column-in-partition', 'c1', ['bb']]])
    expect(issues[0]!.message).toBe('Column "c1" has partition "bb" drawn on through it, by 0.10 m.')
  })

  it('names nothing for a partition that stops at a column, or for the same wall when it is not a partition', () => {
    expect(found([square('c1', 5, 8, 0.3), square('c2', 5, 4.1, 0.3)], true)).toEqual([])
    expect(found([square('c1', 5, 7, 0.3)])).toEqual([])
  })

  it('says a column in the partition\'s doorway once, as in the opening', () => {
    expect(found([square('c1', 5, 5.4, 0.3)], true).map((i) => i.code)).toEqual(['plan/column-in-opening'])
  })
})
