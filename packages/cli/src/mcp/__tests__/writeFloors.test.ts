/**
 * WRT-16: grid_write_rooms, like grid write, refuses rooms text that would drop floors the plan
 * file holds, and rooms text with no rooms, and writes nothing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const THREE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground floor" level 0',
  'room living "Living" living 4 x 4 at 0.15,0.15',
  'floor first "First floor" level 1',
  'raw floor {"homes": 6, "parking": 3}',
  'room bed "Bed" bedroom 4 x 4 at 0.15,0.15',
  '',
].join('\n')
const ONE = 'walls outside 0.3 inside 0.1 height 2.7\nfloor ground "Ground floor" level 0\nroom living "Living" living 4 x 4 at 0.15,0.15\n'

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('grid_write_rooms and floors the text does not mention', () => {
  it('refuses to drop a floor, naming it, and leaves the file as it was', async () => {
    const first = await b.call('grid_write_rooms', { plan: 'block.json', rooms: THREE })
    expect(first.isError, first.text).toBe(false)
    const before = readFileSync(join(b.folder, 'block.json'), 'utf8')
    const refused = await b.call('grid_write_rooms', { plan: 'block.json', rooms: ONE })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('First floor (first): 1 room, 6 homes, 3 parking spaces')
    expect(readFileSync(join(b.folder, 'block.json'), 'utf8')).toBe(before)
    const replaced = await b.call('grid_write_rooms', { plan: 'block.json', rooms: ONE, replace: true })
    expect(replaced.isError, replaced.text).toBe(false)
  })

  it('refuses rooms text with no rooms even with replace', async () => {
    const refused = await b.call('grid_write_rooms', { plan: 'block.json', rooms: 'walls outside 0.3 inside 0.1 height 2.7\n', replace: true })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('no rooms')
  })
})
