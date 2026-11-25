/**
 * LVL-14: writing a plan whose floor above the ground nothing joins to the ground floor says so at
 * once, with the rooms-text line that adds a stair; writing that line clears it. grid write and
 * grid_write_rooms give the same answer (`writeRoomsIntoProject`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground floor" level 0',
  'room living "Living" living 4 x 5 at 0.15,0.15',
  'room kitchen "Kitchen" kitchen 3 x 5 east of living',
  'door front in living south, 1 from west, 0.9 wide',
  'opening pass between living and kitchen, 1.85 from south, 1.2 wide',
  '@stair',
  'floor first "First floor" level 1',
  'room bed "Bedroom" bedroom 4 x 5 at 0.15,0.15',
  'room bath "Bath" bathroom 3 x 5 east of bed',
  'door d2 between bed and bath, 1.85 from south, 0.8 wide',
  '',
].join('\n')

const SAYS =
  'Floor "First floor" stands above the ground, and nothing joins it to the ground floor: no room on it is used as a stair or a lift, and no stair is stated to it (grid check: floor/no-stair). To add one, write under the line that starts "floor ground": room stair "Stair" stair 1 x 3 <where> through first'

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('the write answer on a floor with no stair (LVL-14)', () => {
  it('says it at once, with the line that adds a stair', async () => {
    const written = await b.call('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.replace('@stair\n', '') })
    expect(written.isError, written.text).toBe(false)
    expect(written.text).toContain(SAYS)
    const check = await b.call('grid_check', { plan: 'house.json' })
    expect(check.text).toContain('floor/no-stair')
  })

  it('says nothing once the line is written', async () => {
    const stair = 'room stair "Stair" stair 1 x 3 east of kitchen through first'
    const written = await b.call('grid_write_rooms', { plan: 'stair.json', rooms: HOUSE.replace('@stair', stair) })
    expect(written.isError, written.text).toBe(false)
    expect(written.text).not.toContain('floor/no-stair')
    const check = await b.call('grid_check', { plan: 'stair.json' })
    expect(check.text).not.toContain('floor/no-stair')
  })
})
