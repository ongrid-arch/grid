/**
 * MSG-33: a rooms text refused for several independent mistakes is refused with every one of
 * them, each on its line; a line that fails only because a refused line before it was set aside
 * is not listed; and a text that writes comes back as it was.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { everyProblem } from '../everyProblem'

const walls = 'walls outside 0.3 inside 0.1 height 2.6'

const withAll = (text: string) => everyProblem(text, compileRoomsText(text))

describe('every independent problem of a rooms text (MSG-33)', () => {
  const text = [
    walls,
    'room living "Living" living 4.4 x 0',
    'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living',
    'room hall "Hall" corridor 1.3 x 3 east of nowhere',
    'room bath "Bath" bathroom 2 x 2qq at 20,0',
    'room spare "Spare" bedroom 3 x 3 at 30,0',
    'room study "Study" office 3 x 3 at 31,1',
  ].join('\n')

  it('the compiler alone stops at the first', () => {
    expect(compileRoomsText(text).problems.map((p) => p.line)).toEqual([2])
  })

  it('lists the size, the unknown room, the unit and the overlap, in line order', () => {
    const result = withAll(text)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([
      ['rooms/size', 2],
      ['rooms/unknown-room', 4],
      ['rooms/syntax', 5],
      ['rooms/overlap', 7],
    ])
    expect(result.problems[2]!.message).toMatch(/2qq/)
  })

  it('leaves out a line that failed only because a room it names was refused', () => {
    // The kitchen is placed north of the living room, refused for its size: not listed.
    expect(withAll(text).problems.some((p) => p.line === 3)).toBe(false)
  })

  it('leaves out a door into a refused room', () => {
    const doors = [walls, 'room bath "Bath" bathroom 2 x 0', 'room hall "Hall" corridor 2 x 2 at 10,0', 'door d1 between bath and hall, centred, 0.8 wide', 'room den "Den" living 3 x 3q at 20,0'].join('\n')
    expect(withAll(doors).problems.map((p) => p.line)).toEqual([2, 5])
  })

  it('stops at a line that is not one part, with what it found', () => {
    const floors = [walls, 'room a "A" living 3 x 0', 'floor upper "Upper" level x', 'room b "B" living 3 x 3q at 0,0'].join('\n')
    const first = compileRoomsText(floors)
    const all = withAll(floors)
    expect(all.problems.length).toBeGreaterThanOrEqual(first.problems.length)
    expect(all.problems.map((p) => p.line)).toContain(2)
  })

  it('gives back a text that writes as the compiler gave it', () => {
    const good = [walls, 'room living "Living" living 4 x 4'].join('\n')
    const first = compileRoomsText(good)
    expect(first.plan).not.toBeNull()
    expect(everyProblem(good, first)).toBe(first)
  })
})
