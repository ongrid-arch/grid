/**
 * CMD-44: every change on the tool server is logged beside the plan with the plan it replaced,
 * grid_undo takes changes back one by one, grid_restore puts back any version Grid keeps, and
 * both refuse when the plan changed outside the log.
 */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'
import { twoBedFlat } from './replay/plans'

let b: Bench | undefined
afterEach(() => b?.close())

const folder = (): string => b!.folder
const planText = (): string => readFileSync(join(folder(), 'plan.json'), 'utf8')
const revision = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12)
const log = (): Record<string, unknown>[] => {
  const file = join(folder(), 'plan.history.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>) : []
}
const roomName = (id: string): string => (JSON.parse(planText()) as { rooms: { id: string; name: string }[] }).rooms.find((r) => r.id === id)!.name
const call = (name: string, args: Record<string, unknown> = {}): ReturnType<Bench['call']> => b!.call(name, args)

describe('the change log beside the plan', () => {
  it('logs each change with who, the tool, the revisions and what changed, facts and numbers included, and keeps the plan it replaced', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = planText()
    const facts = await call('grid_set_facts', { parts: ['bed2'], set: { department: 'Sales', capacity: 4 }, who: 'reviewer-2' })
    expect(facts.isError, facts.text).toBe(false)
    const numbered = await call('grid_set_facts', { parts: ['bed2'], number: '2.03' })
    expect(numbered.isError, numbered.text).toBe(false)
    const entries = log()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ seq: 1, by: 'reviewer-2', via: 'grid serve', tool: 'grid_set_facts', before: revision(first) })
    const factLines = (entries[0]!['fields'] as string[]).join('\n')
    expect(factLines).toContain('rooms["bed2"].properties')
    expect(factLines).toContain('"Sales"')
    expect(factLines).toContain('4')
    expect(entries[1]).toMatchObject({ seq: 2, by: null, before: entries[0]!['after'], after: revision(planText()) })
    expect((entries[1]!['fields'] as string[]).join('\n')).toContain('rooms["bed2"].number')
    // The plan each change replaced, whole, by its revision.
    expect(readdirSync(join(folder(), 'plan.checkpoints')).sort()).toEqual([`${entries[0]!['after'] as string}.json`, `${revision(first)}.json`].sort())
    expect(readFileSync(join(folder(), 'plan.checkpoints', `${revision(first)}.json`), 'utf8')).toBe(first)
  })

  it('logs nothing for a change written to another file, or for a read', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    expect((await call('grid_rename_room', { room: 'bed2', name: 'Study', out: 'other.json' })).isError).toBe(false)
    expect((await call('grid_describe')).isError).toBe(false)
    expect(log()).toEqual([])
  })

  it('says the facts and numbers that changed where nothing that stands did, every field with show facts, and the log since then', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    expect((await call('grid_mark_start', { who: 'lead', note: 'before the review' })).isError).toBe(false)
    await call('grid_set_facts', { parts: ['bed2'], set: { department: 'Sales' }, who: 'agent-2' })
    await call('grid_set_facts', { parts: ['bed2'], number: '2.03', who: 'agent-2' })
    const all = await call('grid_diff', { picture: false })
    expect(all.isError, all.text).toBe(false)
    expect(all.text).toContain('by "lead" ("before the review")')
    expect(all.text).not.toContain('Changes: none.')
    // Numbering one room gives the others the numbers Grid counted for them: each is said.
    expect(all.text).toMatch(/Changes: none to what stands; (\d+) fields changed, \1 of them facts or numbers\./)
    expect(all.text).toMatch(/Facts and numbers that changed \(\d+\):/)
    expect(all.text).toContain('rooms["bed2"].properties added: {"department":"Sales"}')
    expect(all.text).toContain('rooms["bed2"].number added: "2.03"')
    expect(all.data!['since']).toMatchObject({ kind: 'marker', by: 'lead', note: 'before the review' })
    const facts = await call('grid_diff', { show: 'facts' })
    expect(facts.text).toMatch(/Fields that changed \(\d+\):/)
    expect((facts.data!['fields'] as unknown[]).length).toBe(facts.data!['fieldsTotal'])
    const history = await call('grid_diff', { show: 'history' })
    expect(history.text).toContain('Change log since then (2), oldest first:')
    expect(history.text).toMatch(/#1 .*grid_set_facts by "agent-2"/)
    expect(history.data!['history']).toHaveLength(2)
  })

  it('compares since the plan before the last change, a revision, a date, and two earlier versions with to', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = revision(planText())
    await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    const second = revision(planText())
    await call('grid_rename_room', { room: 'bed2', name: 'Office' })
    const last = await call('grid_diff', { since: 'last', picture: false })
    expect(last.isError, last.text).toBe(false)
    expect(last.text).toContain(`revision ${second}, before the last change`)
    expect(last.text).toContain('Office')
    const byRevision = await call('grid_diff', { since: first, to: second, picture: false })
    expect(byRevision.isError, byRevision.text).toBe(false)
    expect(byRevision.text).toContain('The later version is')
    expect(byRevision.text).toContain('Study')
    expect(byRevision.text).not.toContain('Office')
    // Before the log began, the plan stood as it was before its first logged change.
    const byDate = await call('grid_diff', { since: '2000-01-01', picture: false })
    expect(byDate.isError, byDate.text).toBe(false)
    expect(byDate.text).toContain(`revision ${first}, as it stood at 2000-01-01`)
    const today = new Date().toISOString().slice(0, 10)
    const sinceToday = await call('grid_diff', { since: today, show: 'history' })
    expect(sinceToday.isError, sinceToday.text).toBe(false)
    expect(sinceToday.text).toContain(`revision ${first}`)
    const unknown = await call('grid_diff', { since: 'nothing-here' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('The plan has no marker "nothing-here": it has none.')
  })
})

describe('grid_undo', () => {
  it('takes changes back one by one, logged like any change, and then says there is nothing left', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = planText()
    await call('grid_rename_room', { room: 'bed2', name: 'Study', who: 'agent-1' })
    const second = planText()
    await call('grid_rename_room', { room: 'bed2', name: 'Office' })
    const one = await call('grid_undo', { who: 'agent-2' })
    expect(one.isError, one.text).toBe(false)
    expect(one.text).toMatch(/^Undid change #2, grid_rename_room, made .*: "plan\.json" is back at revision/m)
    expect(one.text).toContain('1 earlier changes in the log can still be undone')
    expect(planText()).toBe(second)
    expect(one.data).toMatchObject({ undid: { seq: 2, tool: 'grid_rename_room' }, revision: revision(second), left: 1 })
    const two = await call('grid_undo')
    expect(two.isError, two.text).toBe(false)
    expect(two.text).toContain('grid_rename_room by "agent-1"')
    expect(planText()).toBe(first)
    expect(roomName('bed2')).not.toBe('Study')
    const none = await call('grid_undo')
    expect(none.isError).toBe(true)
    expect(none.text).toContain('nothing left to undo')
    expect(log().map((e) => [e['tool'], e['undoes'] ?? null, e['by']])).toEqual([['grid_rename_room', null, 'agent-1'], ['grid_rename_room', null, null], ['grid_undo', 2, 'agent-2'], ['grid_undo', 1, null]])
    // An undo is a change too: restore puts back what it took away.
    const again = await call('grid_restore', { since: revision(second) })
    expect(again.isError, again.text).toBe(false)
    expect(planText()).toBe(second)
  })

  it('is refused with nothing written when the plan changed outside the log, and when there is no log', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const nothing = await call('grid_undo')
    expect(nothing.isError).toBe(true)
    expect(nothing.text).toContain('nothing to undo: the plan has no change log yet')
    await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    const byHand = planText().replace('"Study"', '"Den"')
    writeFileSync(join(folder(), 'plan.json'), byHand)
    const refused = await call('grid_undo')
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('changed outside the changes in its log')
    expect(refused.text).toContain(`the plan is at ${revision(byHand)}`)
    expect(planText()).toBe(byHand)
  })
})

describe('grid_restore', () => {
  it('puts back a marker\'s version, keeping the plan it replaces, and grid_undo takes it back', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = planText()
    await call('grid_mark_start')
    await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    await call('grid_rename_room', { room: 'bed1', name: 'Main bedroom' })
    const before = planText()
    const restored = await call('grid_restore', { since: 'start' })
    expect(restored.isError, restored.text).toBe(false)
    expect(restored.text).toContain('Restored "plan.json" to the plan at marker "start"')
    expect(restored.text).toContain(`The plan it replaced, revision ${revision(before)}, is kept as a checkpoint`)
    expect(restored.text).toContain('What changed back:')
    expect(planText()).toBe(first)
    expect(readFileSync(join(folder(), 'plan.checkpoints', `${revision(before)}.json`), 'utf8')).toBe(before)
    const already = await call('grid_restore', { since: 'start' })
    expect(already.isError).toBe(true)
    expect(already.text).toContain('already')
    expect((await call('grid_undo')).isError).toBe(false)
    expect(planText()).toBe(before)
  })

  it('is refused when the plan changed outside its log, and with force restores, keeping that version', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    const first = planText()
    await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    const broken = '{"version":"1","walls":['
    writeFileSync(join(folder(), 'plan.json'), broken)
    const refused = await call('grid_restore', { since: 'last' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('pass force=true')
    expect(planText()).toBe(broken)
    const forced = await call('grid_restore', { since: 'last', force: true })
    expect(forced.isError, forced.text).toBe(false)
    expect(forced.text).toContain('changed outside its log')
    expect(planText()).toBe(first)
    expect(readFileSync(join(folder(), 'plan.checkpoints', `${revision(broken)}.json`), 'utf8')).toBe(broken)
    // The log goes on from the plan as restored.
    expect((await call('grid_undo')).isError).toBe(false)
    expect(planText()).toBe(broken)
  })

  it('needs since, and names what it does not know', async () => {
    b = bench({ 'plan.json': twoBedFlat() })
    expect((await call('grid_restore')).isError).toBe(true)
    const unknown = await call('grid_restore', { since: 'abcdef123456' })
    expect(unknown.isError).toBe(true)
  })
})
