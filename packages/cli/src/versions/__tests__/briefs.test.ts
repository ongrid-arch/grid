/**
 * CMD-57: two briefs compared wish by wish, paired by what each wish is about, with what asks for
 * less said as weakened.
 */
import { describe, expect, it } from 'vitest'
import { parseBrief } from '../../brief/brief'
import { compareBriefs, lessCount } from '../briefs'

const brief = (raw: Record<string, unknown>) => parseBrief(raw, { versionNeeded: false })

const kitchen = { name: 'Kitchen', at_least: 12, level: 'must', source: 'given', quote: 'a kitchen of at least 12 m²' }
const bath = { name: 'Bathroom', area: 4.5, level: 'should', source: 'assumed' }
const before = brief({
  rooms: [kitchen, bath],
  touch: [{ rooms: ['Kitchen', 'Dining'], level: 'must', source: 'assumed' }],
  figures: { door_width: { value: 0.9, level: 'must', source: 'assumed' }, step: { value: 0.02, level: 'must', source: 'assumed' } },
})

describe('compareBriefs', () => {
  it('finds nothing between a brief and itself', () => {
    expect(compareBriefs(before, before)).toEqual([])
  })

  it('says a must made a should, a least figure lowered and a most figure raised are weakened', () => {
    const after = brief({
      rooms: [{ ...kitchen, at_least: 10, level: 'should' }, bath],
      touch: [{ rooms: ['Dining', 'Kitchen'], level: 'must', source: 'assumed' }],
      figures: { door_width: { value: 0.8, level: 'must', source: 'assumed' }, step: { value: 0.05, level: 'must', source: 'assumed' } },
    })
    const lines = compareBriefs(before, after)
    expect(lines.map((l) => [l.kind, l.where])).toEqual([['weakened', 'rooms[0]'], ['weakened', 'figures.door_width'], ['weakened', 'figures.step']])
    expect(lines[0]!.fields).toEqual(expect.arrayContaining([{ field: 'at_least', before: 12, after: 10 }, { field: 'level', before: 'must', after: 'should' }]))
    expect(lines[0]!.text).toContain('rooms[0] weakened, it asks for less')
    expect(lines[0]!.text).toContain('at_least 12 → 10')
    expect(lessCount(lines)).toBe(3)
  })

  it('pairs a wish by what it is about, so one taken out does not shift the others', () => {
    const after = brief({ rooms: [bath], touch: [{ rooms: ['Kitchen', 'Dining'], level: 'must', source: 'assumed' }], figures: { door_width: { value: 0.9, level: 'must', source: 'assumed' }, step: { value: 0.02, level: 'must', source: 'assumed' } } })
    const lines = compareBriefs(before, after)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'removed', was: 'rooms[0]', where: null, before: { name: 'Kitchen', at_least: 12 } })
    expect(lines[0]!.text).toContain('rooms[0] removed: name "Kitchen", at_least 12')
  })

  it('says a stricter figure is tightened, a new quote changed and a new wish added', () => {
    const after = brief({
      rooms: [kitchen, { ...bath, quote: 'a bathroom of about 4.5 m²', source: 'given' }, { use: 'bedroom', count: 2, level: 'must', source: 'assumed' }],
      touch: [{ rooms: ['Kitchen', 'Dining'], level: 'must', source: 'assumed' }],
      figures: { door_width: { value: 1, level: 'must', source: 'assumed' }, step: { value: 0.02, level: 'must', source: 'assumed' } },
    })
    const kinds = compareBriefs(before, after).map((l) => [l.kind, l.where])
    expect(kinds).toEqual([['changed', 'rooms[1]'], ['tightened', 'figures.door_width'], ['added', 'rooms[2]']])
  })

  it('reads every wish of a brief that is gone as removed', () => {
    const lines = compareBriefs(before, null)
    expect(lines.map((l) => l.kind)).toEqual(['removed', 'removed', 'removed', 'removed', 'removed'])
  })
})
