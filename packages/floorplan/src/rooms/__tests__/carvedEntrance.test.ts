/**
 * WRT-57: a room carved in the corner of another, beside the door that leads outside, splits that
 * side in two: the wall to the new room and a short piece of outside wall. The door's line is
 * refused for not saying which (WRT-51), and the refusal never offers, on its own, the line that
 * leads the door into the new room in place of outside.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'

const FLAT = readFileSync(resolve(__dirname, '../../../fixtures/rooms/flat.rooms'), 'utf8')
/** The sample flat with a store in a corner of its hall, the hall's north side holding the front door. */
const withStore = (store: string, door = 'door door-entrance in hall north, 0.2 from west, 0.9 wide, opens in, hinged east'): string =>
  FLAT.replace(/^room bed2 .*$/m, (line) => `${line}\nroom store "Store" storage ${store}`).replace(/^door door-entrance .*$/m, door)

describe('an entrance door beside a room carved in the corner', () => {
  it('offers no line that leads the door into the store when the side onto the outside is too short', () => {
    const result = compileRoomsText(withStore('1.0 x 1.0 inside hall corner ne'))
    expect(result.plan).toBeNull()
    const [problem] = result.problems
    expect(problem!.code).toBe('rooms/no-side')
    expect(problem!.message).toContain("'north.1', 0.20 m, the wall to the outside; 'north.2', 1.10 m, the wall to 'store'")
    expect(problem!.message).not.toContain('To place it')
    expect(problem!.message).toContain("it would lead into 'store', not outside, and the side onto the outside is too short for it")
    expect(problem!.message).toContain("write 'north.2' if it is meant to lead into 'store'")
    expect(problem!.fixes ?? []).toEqual([])
  })

  it('still offers the line onto the outside, which writes, when the door fits beside the store', () => {
    const result = compileRoomsText(withStore('0.3 x 0.8 inside hall corner nw', 'door door-entrance in hall north, 0.05 from east, 0.8 wide, opens in, hinged east'))
    const [problem] = result.problems
    expect(problem!.code).toBe('rooms/no-side')
    expect(problem!.fixes).toEqual([{ line: 13, text: 'door door-entrance in hall north.2, 0.05 from east, 0.8 wide, opens in, hinged east' }])
    const written = compileRoomsText(withStore('0.3 x 0.8 inside hall corner nw', problem!.fixes![0]!.text))
    expect(written.problems).toEqual([])
    expect(written.openings.find((line) => line.startsWith('door-entrance'))).toContain('joins hall and the outside')
  })

  it('keeps offering a window both sides, as a window leads nowhere', () => {
    const result = compileRoomsText(withStore('1.0 x 1.0 inside hall corner ne', 'window w-hall in hall north, 0.2 from west, 0.6 wide'))
    const [problem] = result.problems
    expect(problem!.code).toBe('rooms/no-side')
    expect(problem!.message).not.toContain('not outside')
  })
})
