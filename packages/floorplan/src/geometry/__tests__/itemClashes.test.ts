/**
 * CNT-21: items standing in each other, an item hanging out of its room and columns standing in
 * items or in each other.
 */
import { describe, expect, it } from 'vitest'
import type { Item } from '../../types/floorplan'
import { flat } from '../../test-support/plans'
import { validatePlan } from '../validate'

const at = (id: string, kind: Item['kind'], x: number, y: number, size: [number, number], extra: Partial<Item> = {}): Item => ({ id, kind, at: [x, y], size, height: 0.8, ...extra })
const found = (items: Item[], columns: unknown[] = []): { code: string; id: string; hits?: readonly string[]; message: string }[] =>
  validatePlan({ ...flat(), items, columns: columns as never }).issues
    .filter((i) => i.entity === 'item' || i.code.startsWith('plan/column-'))
    .map((i) => ({ code: i.code, id: i.id, hits: (i as { hits?: readonly string[] }).hits, message: i.message }))

describe('items that stand in each other', () => {
  it('names a unit half over two others, with both and the depth', () => {
    const issues = found([at('u1', 'storage', 1, 6, [0.6, 0.6]), at('u2', 'storage', 1.6, 6, [0.6, 0.6]), at('u3', 'storage', 1.3, 6.3, [0.6, 0.6])])
    expect(issues.filter((i) => i.code === 'item/overlap').map((i) => [i.id, i.hits])).toEqual([
      ['u3', ['u1']],
      ['u3', ['u2']],
    ])
  })

  it('names a vanity over a basin and a shower on the bath', () => {
    const issues = found([at('basin', 'basin', 7, 7, [0.5, 0.4]), at('vanity', 'storage', 7.1, 7, [0.9, 0.5]), at('bath', 'bath', 8.5, 6.5, [1.7, 0.75]), at('shower', 'shower', 8.5, 6.6, [0.9, 0.9])])
    expect(issues.map((i) => [i.id, i.hits])).toEqual([
      ['vanity', ['basin']],
      ['shower', ['bath']],
    ])
    expect(issues[0]!.message).toContain('stands in')
  })

  it('does not name units that abut within the tolerance', () => {
    expect(found([at('a', 'storage', 1, 6, [0.6, 0.6]), at('b', 'storage', 1.6, 6, [0.6, 0.6]), at('c', 'storage', 2.2005, 6, [0.6, 0.6])])).toEqual([])
  })
})

describe('an item that hangs out of its room', () => {
  it('names an item reaching through a doorway, and not one well inside', () => {
    // The hall's door in the wall x = 4 stands at 1.5 along it.
    const through = found([at('table', 'table', 3.9, 1.5, [1.4, 0.6], { turn: 90 })])
    const out = through.filter((i) => i.code === 'item/leaves-room')
    expect(out.map((i) => i.id)).toEqual(['table'])
    expect(out[0]!.message).toMatch(/^Table "table" leaves room "Hall": \d\.\d\d m² of its floor lies outside the room/)
    expect(found([at('table', 'table', 2, 2, [1.4, 0.6])])).toEqual([])
  })

  it('names an item running into a wall as running into it, not as leaving the room', () => {
    const codes = found([at('table', 'table', 3.75, 3.2, [0.6, 1.4])]).map((i) => i.code)
    expect(codes).toContain('item/into-wall')
    expect(codes).not.toContain('item/leaves-room')
  })
})

describe('columns that stand in items or in each other', () => {
  const column = (id: string, x: number, y: number, extra: object = {}): unknown => ({ id, at: [x, y], width: 0.4, height: 2.7, ...extra })

  it('names a column inside a rack, and not one against its face', () => {
    const rack = at('rack', 'storage', 7, 6, [1.2, 0.5])
    expect(found([rack], [column('c1', 7, 6)]).map((i) => [i.code, i.id, i.hits])).toEqual([['plan/column-in-item', 'c1', ['rack']]])
    expect(found([rack], [column('c2', 7, 6.45)])).toEqual([])
  })

  it('names two columns on the same spot', () => {
    expect(found([], [column('c1', 7, 6), column('c2', 7.1, 6)]).map((i) => [i.code, i.id, i.hits])).toEqual([['plan/column-overlap', 'c2', ['c1']]])
    expect(found([], [column('c1', 7, 6), column('c2', 7.6, 6)])).toEqual([])
  })
})
