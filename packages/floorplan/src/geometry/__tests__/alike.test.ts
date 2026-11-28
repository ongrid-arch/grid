/**
 * MSG-36: what "alike" means for a note said once: the same words but for the numbers in quoted
 * ids; ids said as runs; and the one pattern a set of renamed ids shares.
 */
import { describe, expect, it } from 'vitest'
import { sayValue } from '../../messages/say'
import { alikeKey, alikeTexts, groupAlike, idRuns, renamePattern, renamePatternSaid, wordsThatDiffer } from '../alike'

describe('lines alike', () => {
  it('read the same once the numbers in quoted ids are set aside, and only those', () => {
    expect(alikeKey('Door "l03-door-2" hits another door')).toBe(alikeKey('Door "l17-door-2" hits another door'))
    expect(alikeKey("door 'door-101' reaches 3.20 m")).toBe(alikeKey("door 'door-114' reaches 3.20 m"))
    // A figure outside the quotes keeps two lines apart.
    expect(alikeKey('A door "l01-front", 2.95 m above the ground')).not.toBe(alikeKey('A door "l02-front", 5.90 m above the ground'))
    // So do other words in the quotes.
    expect(alikeKey('Room "Kitchen"')).not.toBe(alikeKey('Room "Bathroom"'))
  })

  it('are gathered in the order they came, and only three or more of them', () => {
    const groups = groupAlike(['a1', 'b', 'a2', 'c1', 'a3', 'c2'], (s) => s.replace(/\d/g, ''))
    expect(groups).toEqual([['a1', 'a2', 'a3'], ['b'], ['c1'], ['c2']])
    expect(groupAlike(['x', 'x'], (s) => s)).toEqual([['x'], ['x']])
  })

  it('name the word that differs in each', () => {
    expect(wordsThatDiffer(['"Bathroom" on "l01"', '"Bathroom" on "l02"'])).toEqual(['"l01"', '"l02"'])
    expect(wordsThatDiffer(['same "a"', 'same "a"'])).toEqual([])
  })

  it('are said once, the others by the word that differs, as runs', () => {
    const lines = [1, 2, 3, 4].map((n) => `rooms/opening-too-high: Line 5: door 'door-10${n}' reaches 3.20 m but the walls are 2.80 m high.`)
    expect(alikeTexts([...lines, 'rooms/other: Line 9: no.'])).toEqual([
      "rooms/opening-too-high: Line 5: door 'door-101' reaches 3.20 m but the walls are 2.80 m high. (the same for 3 more: 'door-102' to 'door-104')",
      'rooms/other: Line 9: no.'
    ])
    expect(alikeTexts(['x "a"', 'x "a"', 'x "a"'])).toEqual(['x "a" (3 times)'])
  })
})

describe('ids as runs', () => {
  const say = (ids: string[]): string => sayValue('en', idRuns(ids))

  it('say three or more one after another by their ends, and the rest one by one', () => {
    expect(say(Array.from({ length: 14 }, (_, i) => `door-${101 + i}`))).toBe('"door-101" to "door-114"')
    expect(say(['l00', ...Array.from({ length: 14 }, (_, i) => `l${String(4 + i).padStart(2, '0')}`)])).toBe('"l00", "l04" to "l17"')
    expect(say(['f1', 'f2', 'f4'])).toBe('"f1", "f2", "f4"')
    expect(say(['l09', 'l10', 'l11'])).toBe('"l09" to "l11"')
    expect(say(['a', 'b', 'a'])).toBe('"a", "b"')
  })

  it('say at most twelve runs, and how many ids are left', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `r${i * 2}`)
    expect(say(ids)).toBe(`${ids.slice(0, 12).map((id) => `"${id}"`).join(', ')} and 8 more`)
  })
})

describe('a rename pattern', () => {
  it('is the one change the renamed ids share, widened to whole words', () => {
    const pairs = ['w1', 'w2', 'r12', 'd3'].map((id) => ({ before: `l01-${id}`, after: `l02-${id}` }))
    expect(renamePattern(pairs)).toEqual({ from: 'l01', to: 'l02', count: 4 })
    expect(sayValue('en', renamePatternSaid(renamePattern(pairs)!))).toBe('4 of them by one pattern, "l01" now "l02"')
  })

  it('says a word put in front, and holds for the most ids', () => {
    const pairs = [...['w1', 'w2', 'w3'].map((id) => ({ before: id, after: `f1-${id}` })), { before: 'kitchen', after: 'cook' }]
    const pattern = renamePattern(pairs)!
    expect(pattern).toEqual({ from: '', to: 'f1-', count: 3 })
    expect(sayValue('en', renamePatternSaid(pattern))).toBe('3 of them by one pattern, "f1-" added')
  })

  it('is none when fewer than three ids share one', () => {
    expect(renamePattern([{ before: 'a1', after: 'b1' }, { before: 'kitchen', after: 'cook' }])).toBeNull()
  })
})
