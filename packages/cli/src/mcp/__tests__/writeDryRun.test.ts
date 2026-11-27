/**
 * CMD-54: `grid_write_rooms dry_run=true` tries rooms text against the plan and answers as the
 * write would, writing nothing: no plan file, no change log, no checkpoint, nothing beside it.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

const ROOMS = ['room living "Living room" living 4.4 x 4.2', 'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living', 'door d1 between kitchen and living, centred, 0.8 wide'].join('\n')

let b: Bench
beforeEach(() => {
  b = bench({})
})
afterEach(() => b.close())

const files = (): string[] => readdirSync(b.folder).sort()

describe('trying rooms text without writing it (CMD-54)', () => {
  it('answers the rooms of a text and leaves a folder with no plan as it was', async () => {
    const was = files()
    const reply = await b.call('grid_write_rooms', { plan: 'scratch.json', rooms: ROOMS, dry_run: true })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/^Dry run: tried the rooms text against "scratch\.json" and wrote nothing/m)
    expect(reply.text).not.toMatch(/^Wrote /m)
    expect(reply.data).toMatchObject({ dryRun: true, written: 'scratch.json', walls: expect.any(Number) })
    expect((reply.data!['rooms'] as unknown[]).length).toBe(2)
    expect(files()).toEqual(was)
  })

  it('leaves a plan, its change log and its checkpoints as they were, and says what would change', async () => {
    const wrote = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: ROOMS })
    expect(wrote.isError, wrote.text).toBe(false)
    expect(wrote.data).toMatchObject({ dryRun: false })
    const bytes = readFileSync(join(b.folder, 'flat.json'), 'utf8')
    const was = files()
    const history = was.includes('flat.history.jsonl') ? readFileSync(join(b.folder, 'flat.history.jsonl'), 'utf8') : null

    const bigger = ROOMS.replace('4.4 x 4.2', '5.0 x 4.2').replace(/4\.4 x 3\.0/, '5.0 x 3.0')
    const tried = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: bigger, dry_run: true })
    expect(tried.isError, tried.text).toBe(false)
    expect(tried.data).toMatchObject({ dryRun: true, written: 'flat.json' })
    // What writing it would change, against the plan as it is.
    expect(tried.data!['verdict']).toEqual(expect.stringContaining('the plan this text writes'))
    expect(readFileSync(join(b.folder, 'flat.json'), 'utf8')).toBe(bytes)
    expect(files()).toEqual(was)
    if (history !== null) expect(readFileSync(join(b.folder, 'flat.history.jsonl'), 'utf8')).toBe(history)
  })

  it('refuses rooms text with problems as the write does, naming them', async () => {
    const reply = await b.call('grid_write_rooms', { plan: 'scratch.json', rooms: 'room a "A" living 4 x 4\nroom b "B" kennel 3 x 3 east of a', dry_run: true })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/kennel/)
    expect(files()).not.toContain('scratch.json')
  })

  it('goes with rooms text only', async () => {
    const reply = await b.call('grid_write_rooms', { layout: 'tidy', dry_run: true })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/dry_run goes with rooms or roomsFile, not layout/)
  })
})
