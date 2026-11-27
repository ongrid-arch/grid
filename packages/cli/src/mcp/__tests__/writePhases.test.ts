/**
 * WRT-81: a plan with phases is read back as rooms text with its phase words, and that text writes
 * over it; a text that states no phase is refused with what writing it, or --replace, would do.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const ROOMS = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room a "Front" office 4 x 4 at 0,0',
  'room b "Back" office 4 x 4 east of a',
  'door d1 between a and b, centred, 0.9 wide',
  'door f in a south, centred, 0.9 wide',
  '',
].join('\n')

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('writing rooms text over a plan with phases (WRT-81)', () => {
  it('reads a survey back with its phases, and writes that text over it', async () => {
    expect((await b.call('grid_write_rooms', { plan: 'survey.json', rooms: ROOMS })).isError).toBe(false)
    expect((await b.call('grid_start_works', { plan: 'survey.json' })).isError).toBe(false)
    const read = await b.call('grid_describe', { plan: 'survey.json', as: 'rooms' })
    expect(read.text).toContain('\nphase existing\n')
    expect(read.text).not.toMatch(/^raw /m)
    const text = read.text.split('\n').filter((line) => !line.startsWith('# ')).join('\n')
    const again = await b.call('grid_write_rooms', { plan: 'survey.json', rooms: text.replace('"Back"', '"Store"') })
    expect(again.isError, again.text).toBe(false)
  })

  it('refuses a text that states no phase, saying --replace would write none', async () => {
    const refused = await b.call('grid_write_rooms', { plan: 'survey.json', rooms: ROOMS })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('"survey.json" states its parts\' phases (existing, demolished or new), and this rooms text states none, so writing it would write every part with none, and so would replace=true.')
    expect(refused.text).toContain('grid_describe as=rooms')
  })
})
