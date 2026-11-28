/**
 * CMD-57: a marker keeps the brief beside the plan, grid_diff says how the brief changed since,
 * and grid_write_brief says what it replaced and gives the old brief back.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'
import { twoBedFlat } from './replay/plans'

let b: Bench | undefined
afterEach(() => b?.close())

const call = (name: string, args: Record<string, unknown> = {}): ReturnType<Bench['call']> => b!.call(name, args)

const BRIEF = {
  rooms: [
    { name: 'Kitchen', at_least: 8, level: 'must', source: 'given', quote: 'a kitchen of at least 8 square metres' },
    { use: 'bedroom', count: 2, level: 'must', source: 'given', quote: 'two bedrooms' },
  ],
  figures: { door_width: { value: 0.85, level: 'must', source: 'given', quote: 'doors of 85 cm' } },
}

describe('the brief kept with a marker', () => {
  it('keeps the brief with the marker and lists a wish weakened and one removed since', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    expect((await call('grid_write_brief', { brief: BRIEF })).isError).toBe(false)
    const mark = await call('grid_mark_start', { who: 'lead' })
    expect(mark.isError, mark.text).toBe(false)
    expect(mark.data!['brief']).toBe(true)
    expect(mark.text).toContain('The brief beside the plan is kept with the marker')
    const markers = JSON.parse(readFileSync(join(b.folder, 'plan.markers.json'), 'utf8')) as { markers: { brief?: string }[] }
    expect(JSON.parse(markers.markers[0]!.brief!)).toMatchObject({ rooms: [{ name: 'Kitchen', at_least: 8 }, { use: 'bedroom' }] })

    // A reviewer loosens the door and takes the kitchen out.
    expect((await call('grid_write_brief', { update: { where: 'figures.door_width', with: { value: 0.75, level: 'should' } } })).isError).toBe(false)
    expect((await call('grid_write_brief', { remove: ['rooms[0]'] })).isError).toBe(false)

    const diff = await call('grid_diff', { picture: false })
    expect(diff.isError, diff.text).toBe(false)
    expect(diff.text).toContain('Brief, since then (2 changed, 2 weakened or removed):')
    expect(diff.text).toContain('figures.door_width weakened, it asks for less: value 0.85 → 0.75; level "must" → "should"')
    expect(diff.text).toContain('rooms[0] removed: name "Kitchen", at_least 8')
    const brief = diff.data!['brief'] as { compared: boolean; changes: { kind: string; was: string | null; before: unknown }[] }
    expect(brief.compared).toBe(true)
    expect(brief.changes.map((c) => c.kind).sort()).toEqual(['removed', 'weakened'])
    expect(brief.changes.find((c) => c.kind === 'removed')).toMatchObject({ was: 'rooms[0]', before: { name: 'Kitchen', at_least: 8, level: 'must' } })
  })

  it('says the brief was not compared with a marker that keeps none, and says the same brief is the same', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const none = await call('grid_mark_start', { name: 'empty' })
    expect(none.data!['brief']).toBe(false)
    expect(none.text).toContain('There is no brief beside the plan, so the marker keeps none.')
    // A marker set before markers kept the brief has no brief field at all.
    const file = join(b.folder, 'plan.markers.json')
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { version: string; markers: Record<string, unknown>[] }
    writeFileSync(file, JSON.stringify({ ...kept, markers: [...kept.markers, { name: 'old', at: kept.markers[0]!['at'], text: kept.markers[0]!['text'] }] }))
    expect((await call('grid_write_brief', { brief: BRIEF })).isError).toBe(false)
    const old = await call('grid_diff', { since: 'old', picture: false })
    expect(old.text).toContain('Brief: not compared, the marker keeps no brief')
    expect(old.data!['brief']).toMatchObject({ compared: false, changes: [] })
    // From no brief to one: every wish added.
    const empty = await call('grid_diff', { since: 'empty', picture: false })
    expect(empty.text).toContain('Brief, since then (3 changed, 0 weakened or removed):')
    expect((await call('grid_mark_start', { name: 'now' })).isError).toBe(false)
    const same = await call('grid_diff', { since: 'now', picture: false })
    expect(same.text).toContain('Brief: the same wishes as then.')
  })
})

describe('grid_write_brief over a brief kept', () => {
  it('says what replace: true replaced and weakened, and gives the old brief back to restore', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = await call('grid_write_brief', { brief: BRIEF })
    expect(first.data!['replaced']).toBeNull()
    const second = await call('grid_write_brief', { replace: true, brief: { rooms: [{ use: 'bedroom', count: 2, level: 'should', source: 'given', quote: 'two bedrooms' }] } })
    expect(second.isError, second.text).toBe(false)
    expect(second.text).toContain('It replaced the brief kept before (3 changed, 3 weakened or removed):')
    expect(second.text).toContain('rooms[0] (was rooms[1]) weakened, it asks for less: level "must" → "should"')
    expect(second.text).toContain('rooms[0] removed: name "Kitchen"')
    expect(second.text).toContain('figures.door_width removed')
    expect(second.text).toContain('pass it as brief with replace: true to put it back')
    const replaced = second.data!['replaced'] as { previous: Record<string, unknown> }
    // The old brief, passed back, puts it back as it was.
    const back = await call('grid_write_brief', { replace: true, brief: replaced.previous })
    expect(back.isError, back.text).toBe(false)
    expect(back.text).toContain('(3 changed, 0 weakened or removed)')
    const again = await call('grid_write_brief', { replace: true, brief: BRIEF })
    expect(again.text).toContain('The brief kept before held the same wishes.')
  })
})
