/**
 * CNT-24: counting by a figure groups it as printed: equal sizes are one group.
 */
import { describe, expect, it } from 'vitest'
import { GRID_FIELDS, groupParts, type Asked, type Field, type Part } from '../query'

const field = (name: string): Field => ({ from: 'grid', info: GRID_FIELDS.find((f) => f.name === name)! })
const area = field('area')
const width = field('width')
const level = field('level')

function asked(values: Record<string, number>): Asked {
  return { survey: undefined as never, parts: [], value: (part) => values[part.id] ?? null }
}
const parts = (ids: string[]): Part[] => ids.map((id) => ({ kind: 'room', id, floor: 'g', facts: {} }))

describe('groupParts by a measure', () => {
  it('puts areas that print the same in one group, with the true sum', () => {
    const values = { a: 13.4996, b: 13.5004, c: 13.5, d: 13.51 }
    const groups = groupParts(asked(values), parts(['a', 'b', 'c', 'd']), area, [area])
    expect(groups.map((g) => [g.value, g.count])).toEqual([[13.5, 3], [13.51, 1]])
    expect(groups[0]!.sums['area']).toBeCloseTo(40.5, 4)
  })

  it('keeps the same group whichever part comes first', () => {
    const values = { a: 3.2, b: 3.1999999, c: 3.2000001 }
    for (const order of [['a', 'b', 'c'], ['c', 'b', 'a']]) {
      const groups = groupParts(asked(values), parts(order), area, [])
      expect(groups).toHaveLength(1)
      expect(groups[0]!.value).toBe(3.2)
      expect(groups[0]!.count).toBe(3)
    }
  })

  it('groups lengths to the millimetre', () => {
    const groups = groupParts(asked({ a: 0.9, b: 0.9004, c: 0.901 }), parts(['a', 'b', 'c']), width, [])
    expect(groups.map((g) => [g.value, g.count])).toEqual([[0.9, 2], [0.901, 1]])
  })

  it('leaves a number with no unit as it was', () => {
    const groups = groupParts(asked({ a: 1, b: 1.0004 }), parts(['a', 'b']), level, [])
    expect(groups.map((g) => g.value).sort()).toEqual([1, 1.0004])
  })
})
