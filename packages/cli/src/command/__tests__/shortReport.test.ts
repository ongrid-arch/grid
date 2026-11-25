/**
 * MSG-10: a short report sized to the plan, where a seen note can be set aside.
 *
 * The default `grid check` and `grid_check` give the label, the notes, what was not checked and
 * what each check looked at, in counts, and no fixed table of rules or figures: the lab's 62.65
 * m² flat gets under 1,000 bytes (lab AD-2: 6,161 for every plan before), with no place stated and
 * with the US stated (COD-3). A note marked seen
 * stays listed, under Seen, with its reason and who marked it, and is new again when one of its
 * parts changes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { edit, flat } from '@ongrid/floorplan/test-support/plans'
import { approvalWords, figureUsedText, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { openProject, type Project } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { parseSeen, partsOf, readSeen, seenFileOf, SeenRefused } from '../../seen/marks'
import { checkPlan, checkText, markNote, withSeen, type CheckResult } from '../check'
import { runGrid } from '../main'
import { loadPlan } from '../plan'

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')
const LOFT = readFileSync(resolve(__dirname, '../../../fixtures/tiny-loft.json'), 'utf8')

let dir: string
let project: Project
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-short-report-'))
  writeFileSync(join(dir, 'flat.json'), FLAT)
  writeFileSync(join(dir, 'plan.json'), LOFT)
  project = openProject(dir, dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const tool = (name: string) => GRID_TOOLS.find((t) => t.name === name)!
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8')

/**
 * LVL-4: the ground check's line, which every plan that states no ground level gets. MSG-10's
 * 1,000-byte target is held for the rest of the report; with this line the flat's report is over
 * it (reviews/LVL-4.md, "For the owner").
 */
const GROUND_LINE = 'Nothing was checked for "No door or window in an outside wall lies below the ground level the site states": it looked at no doors and openings; not looked at 13: the plan states no ground level for the site.'

/** The check of a plan in the project, with its seen marks read. */
function check(file: string, request: { floor?: string; country?: string } = {}): CheckResult {
  const loaded = loadPlan(project, file)
  return withSeen(checkPlan(loaded, request), loaded, readSeen(project, file))
}

async function grid(args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const code = await runGrid(args, { stdout: (data) => { out += String(data) }, stderr: (text) => { err += text }, stdoutIsTerminal: false, cwd: dir })
  return { code, out, err }
}

describe('the default report of the 62.65 m² flat', () => {
  it('is the lab flat: 62.65 m² net', () => {
    expect(planAreas(surveyPlan(loadPlan(project, 'flat.json').plan)).net).toBeCloseTo(62.65, 6)
  })

  // COD-3: the flat states no place, so no figure is applied, and the line after the label says so.
  it('grid check: the label, the place, the notes and the coverage counts, and no fixed tables, in 1,196 bytes (984 without LVL-4\'s ground line)', async () => {
    const run = await grid(['check', 'flat.json'])
    expect(run.code).toBe(0)
    const text = run.out
    expect(text.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(text.split('\n')[1]).toBe('No place is stated, so no figure was applied: the US figures would have given no lines. State it in the plan as site.country, or give --country.')
    expect(text).toContain('To look at: nothing. That only means these checks found nothing, not that the plan meets any rule.')
    expect(text).toContain('Looked at by at least one check: 6 of 6 rooms.')
    expect(text).toContain('What each check looked at (8):')
    expect(text).toContain('  - Every room has a door or an opening to another space: 6 rooms.')
    expect(text).toContain('  - Nothing was checked for "A stair or a lift shaft drawn as a room on each floor lies over itself from floor to floor": it looked at no rooms.')
    expect(text).toContain('  - Room sizes and escape openings: not run: no place is stated, so no figure was applied.')
    expect(text).toContain('Checks run: 4. --full lists the checks, the figures, the parts looked at and what is never looked at (11).')
    // No fixed table of rules, figures or limits.
    expect(text).not.toMatch(/Checks run \(|Figures used|The figure used here|What these checks never look at \(|Ceiling height/)
    expect(approvalWords(text)).toEqual([])
    expect(text).toContain(`  - ${GROUND_LINE}`)
    expect(bytes(text)).toBe(1196)
    // LVL-4's ground line puts the report over MSG-10's 1,000 bytes; without it, it is under.
    expect(bytes(text) - bytes(`  - ${GROUND_LINE}\n`)).toBe(984)
  })

  it('grid check with the US stated: the place line names the figures, in 1,200 bytes (988 without the ground line)', async () => {
    const run = await grid(['check', 'flat.json', '--country', 'US'])
    const text = run.out
    expect(text.split('\n')[1]).toBe('Place: United States, from --country; figures from US model codes, read for homes.')
    expect(text).toContain('  - Rooms people live or sleep in have a minimum floor area: 3 rooms.')
    expect(text).toContain('Checks run: 6. --full lists the checks, the figures, the parts looked at and what is never looked at (11).')
    expect(approvalWords(text)).toEqual([])
    // The same report as before COD-3, with the place line for the line on the kind of building.
    expect(bytes(text)).toBe(1200)
    expect(bytes(text) - bytes(`  - ${GROUND_LINE}\n`)).toBe(988)
  })

  it('grid_check: the same, in 1,179 bytes of text (969 without the ground line)', async () => {
    const answer = await tool('grid_check').run({ plan: 'flat.json' }, { project })
    const text = answer.text
    expect(text.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(text.split('\n')[1]).toBe('No place is stated, so no figure was applied: the US figures would have given no lines. State it in the plan as site.country, or give country.')
    expect(text).toContain('To look at: nothing. That only means these checks found nothing, not that the plan meets any rule. Checks run: 4.')
    expect(text).toContain('Looked at by at least one check: 6 of 6 rooms.')
    expect(text).toContain('  Room sizes and escape openings: not run: no place is stated, so no figure was applied.')
    expect(text).toContain('full=true lists the checks, the figures, the parts looked at and what is never looked at (11).')
    expect(text).not.toMatch(/The figure used here|Never looked at, whatever the plan|Ceiling height/)
    expect(approvalWords(text)).toEqual([])
    expect(text).toContain(`  ${GROUND_LINE}`)
    expect(bytes(text)).toBe(1179)
    expect(bytes(text) - bytes(`  ${GROUND_LINE}\n`)).toBe(969)
    // The data keeps the whole record: coverage and limits are there either way.
    const data = answer.data as { coverage: unknown[]; limits: string[]; seenCount: number; marksProblem: string | null }
    expect(data.coverage).toHaveLength(9)
    expect(data.limits).toContain('Ceiling height is not checked, in any room or under a sloping roof')
    expect([data.seenCount, data.marksProblem]).toEqual([0, null])
    const us = await tool('grid_check').run({ plan: 'flat.json', country: 'US' }, { project })
    expect(us.text).toContain('  Rooms people live or sleep in have a minimum floor area: 3 rooms.')
    expect(bytes(us.text) - bytes(`  ${GROUND_LINE}\n`)).toBeLessThan(1000)
  })

  it('--full and full=true give the whole report, as before', async () => {
    // COD-3: with the US stated, so every figure is there.
    const full = (await grid(['check', 'flat.json', '--full', '--country', 'US'])).out
    expect(full).toBe(checkText(check('flat.json', { country: 'US' }), 1, { full: true }))
    for (const heading of ['Checks run (6):', 'Figures used (6):', 'What these checks never look at (11):', 'What each check looked at (9):']) expect(full).toContain(heading)
    expect(full).toContain('      looked at: "bath", "bed1", "bed2", "hall", "kitchen", "living"')
    const answer = await tool('grid_check').run({ plan: 'flat.json', full: true, country: 'US' }, { project })
    expect(answer.text).toContain('Never looked at, whatever the plan (11):')
    expect(answer.text).toContain('Figures used (6):')
    expect(answer.text).toContain('  - Rooms people live or sleep in have a minimum floor area (US model codes: IBC 2024 and IRC 2024)')
  })
})

describe('a plan with a finding', () => {
  it('gives the figures that finding used, each with its document, edition, clause and status, and no others', () => {
    const result = check('plan.json', { country: 'US' })
    const text = checkText(result, 2)
    const used = result.result.lines.flatMap((line) => line.figures ?? [])
    expect(used.length).toBeGreaterThan(0)
    expect(text).toContain(`Figures these notes used (${used.length}):`)
    for (const figure of used) expect(text).toContain(figureUsedText(figure))
    // The room-size figure was applied but used by no note: only the full report gives it.
    const other = result.report.figures.find((f) => f.key === 'habitableRoomMinArea')!
    expect(text).not.toContain(figureUsedText(other))
    expect(checkText(result, 2, { full: true })).toContain(figureUsedText(other))
    expect(text).toContain('  - Every room has a route to a way out of the building: 3 rooms; not looked at 1: on a floor Grid cannot follow down to the ground floor.')
  })
})

describe('a plan that says it is not a home (CNT-5)', () => {
  it('lists the home figures it did not check as notes, and says why in the counts', async () => {
    writeFileSync(join(dir, 'office.json'), JSON.stringify({ ...JSON.parse(FLAT), building: 'office' }))
    const because = 'the figures were read for homes (houses and flats people live in), and the plan says this is an office'
    const run = await grid(['check', 'office.json'])
    expect(run.code).toBe(0)
    const answer = await tool('grid_check').run({ plan: 'office.json' }, { project })
    for (const text of [run.out, answer.text]) {
      // The command gives each note's fix on its own line, the tool after the message: the note and its code are in both.
      expect(text).toMatch(/1\. not checked, the plan: Room sizes were not checked: the figures here were read for homes \(houses and flats people live in\), and the plan says this is an office\..*\[plan\/not-checked-sizes-for-building\]/s)
      expect(text).toMatch(/2\. not checked, the plan: Escape openings were not checked: the figures here were read for homes \(houses and flats people live in\), and the plan says this is an office\..*\[plan\/not-checked-escapes-for-building\]/s)
      expect(text).toContain(`Nothing was checked for "Rooms people live or sleep in have a minimum floor area": it looked at no rooms; not looked at 6: ${because}.`)
      expect(text).toContain(`Nothing was checked for "Bedrooms have a window or door to the outside someone can escape through": it looked at no rooms; not looked at 6: ${because}.`)
      expect(approvalWords(text)).toEqual([])
    }
  })
})

describe('a note set aside as seen', () => {
  // LVL-14: the loft's note that no stair reaches it is note 2, so the window is note 3.
  const WINDOW = 3

  it('stays listed under Seen, with its reason and who marked it, and the count says so', async () => {
    const run = await grid(['check', 'plan.json', '--country', 'US', '--seen', String(WINDOW), '--reason', 'To be enlarged on site', '--by', 'Owner'])
    expect(run.code).toBe(0)
    const [label, marked] = run.out.split('\n')
    expect(label).toBe(GENERAL_GUIDANCE_LABEL)
    expect(marked).toMatch(/^Marked note 3 as seen, by "Owner" on \d{4}-\d{2}-\d{2}: "To be enlarged on site", in plan\.seen\.json: finding, room "loft-loft": .* \[room\/escape-window-too-small\] It stays listed, under Seen, and is new again when one of room "loft-loft", wall /)

    const result = check('plan.json', { country: 'US' })
    expect(result.seen!.states.map((s) => s.state)).toEqual(['new', 'new', 'seen'])
    const text = checkText(result, 2)
    expect(text).toContain('To look at (3): 1 worth a look, 2 findings; 1 of them seen, listed under Seen.')
    expect(text).toContain('Seen (1): each stays listed here, and is new again when one of its parts changes.')
    expect(text).toMatch(/\n {2}3\. finding, room "loft-loft" on "loft": The window of "Sleeping loft" is too small to escape through\. \[room\/escape-window-too-small\]\n {6}seen by "Owner" on \d{4}-\d{2}-\d{2}: "To be enlarged on site"\n/)
    // Listed once, under Seen, and never called dealt with.
    expect(text.match(/\[room\/escape-window-too-small\]/g)).toHaveLength(1)
    expect(text).not.toMatch(/resolved|fixed|closed|dismissed/i)
    expect(approvalWords(text)).toEqual([])

    const answer = await tool('grid_check').run({ plan: 'plan.json', country: 'US' }, { project })
    expect(answer.text).toContain('To look at: 3 (1 worth a look, 2 findings; 1 of them seen, under Seen).')
    expect(answer.text).toMatch(/Seen \(1\): .*\n {2}3\. finding, room "loft-loft": .* Seen by "Owner" on \d{4}-\d{2}-\d{2}: "To be enlarged on site"\. \[room\/escape-window-too-small\]/)
    const data = answer.data as { seenCount: number; marksFile: string; lines: Array<{ seen?: { state: string; reason: string; by: string } }> }
    expect(data.seenCount).toBe(1)
    expect(data.marksFile).toBe('plan.seen.json')
    expect(data.lines[2]!.seen).toMatchObject({ state: 'seen', reason: 'To be enlarged on site', by: 'Owner' })
    expect(data.lines[0]!.seen).toBeUndefined()
  })

  it('is new again when one of its parts changes, and says which; a change elsewhere leaves it seen', () => {
    const loaded = loadPlan(project, 'plan.json')
    markNote(project, 'plan.json', loaded, checkPlan(loaded, { country: 'US' }), { mark: 'seen', number: WINDOW, reason: 'To be enlarged on site', by: 'Owner', at: '2026-11-22T10:00:00.000Z' }, '--seen')
    const plan = JSON.parse(LOFT) as { walls: Array<{ id: string; height?: number; floor?: string }>; openings: Array<{ id: string; width: number }> }

    // A wall on the ground floor: no part of the note.
    const ground = plan.walls.find((w) => (w.floor ?? 'ground') === 'ground')!
    ground.height = (ground.height ?? 2.4) + 0.2
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
    expect(check('plan.json', { country: 'US' }).seen!.states[WINDOW - 1]!.state).toBe('seen')

    // The window itself: wider, and still too low to escape through.
    plan.openings.find((o) => o.id === 'loft-w-loft')!.width += 0.1
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
    const result = check('plan.json', { country: 'US' })
    const state = result.seen!.states[result.result.lines.findIndex((l) => l.code === 'room/escape-window-too-small')]!
    expect(state.state).toBe('back')
    const text = checkText(result, 2)
    expect(text).toContain('      seen before, by "Owner" on 2026-11-22: "To be enlarged on site"; but opening "loft-w-loft" changed since, so it is new again.')
    expect(text).not.toContain('Seen (')
    expect(text).toContain('To look at (3): 1 worth a look, 2 findings.')
    // Reading never writes: the mark stays in the file, and holds no more.
    expect(readSeen(project, 'plan.json').marks).toHaveLength(1)
  })

  it('a room is its outline: moving one of its walls brings the note back', () => {
    const loaded = loadPlan(project, 'plan.json')
    const line = checkPlan(loaded, { country: 'US' }).result.lines[WINDOW - 1]!
    const parts = partsOf(loaded, line)
    expect(parts.map((p) => `${p.kind} ${p.id}`)).toEqual(['room loft-loft', 'wall loft-ext-south', 'wall loft-ext-east', 'wall loft-ext-north', 'wall loft-ext-west', 'opening loft-w-loft'])
  })

  // The coordinator's case: the plan as read leaves an unknown field out, so the file's own
  // values are part of the mark.
  it.each([
    ['a field Grid does not read, at the top of the plan', 'plan/unknown-field', { extra: 1 }, { extra: 2 }, 'the plan'],
    ['a field Grid does not read, on a wall', 'plan/unknown-field', { wall: { colour: 'red' } }, { wall: { colour: 'blue' } }, 'wall "w-south"'],
    ['a value Grid leaves out (MSG-6)', 'plan/value-left-out', { opening: { swing: 'sideways' } }, { opening: { swing: 'upwards' } }, 'opening "d-front"'],
    ['a number written as text, read as meant (MSG-6)', 'plan/read-as-meant', { wall: { height: '2.6' } }, { wall: { height: '2.7' } }, 'wall "w-south"'],
  ])('%s: a change to the value in the file brings the note back', async (_, code, before, after, part) => {
    const flat = JSON.parse(FLAT) as Record<string, unknown> & { walls: Array<Record<string, unknown>>; openings: Array<Record<string, unknown>> }
    const write = (change: { extra?: number; wall?: Record<string, unknown>; opening?: Record<string, unknown> }): void => {
      const copy = structuredClone(flat)
      if (change.extra !== undefined) copy['extra'] = change.extra
      copy.walls[0] = { ...copy.walls[0], id: 'w-south', ...change.wall }
      copy.openings[0] = { ...copy.openings[0], id: 'd-front', ...change.opening }
      // The renamed wall and opening keep the rest of the plan pointing at them.
      const text = JSON.stringify(copy).split(JSON.stringify(flat.walls[0]!['id'])).join('"w-south"').split(JSON.stringify(flat.openings[0]!['id'])).join('"d-front"')
      writeFileSync(join(dir, 'noted.json'), text)
    }
    write(before)
    const first = check('noted.json')
    const number = first.result.lines.findIndex((l) => l.code === code) + 1
    expect(number, first.result.lines.map((l) => l.code).join(', ')).toBeGreaterThan(0)
    const run = await grid(['check', 'noted.json', '--seen', String(number), '--reason', 'Ours', '--by', 'Owner'])
    expect(run.code, run.err).toBe(0)
    // Read again, unchanged: still seen.
    expect(check('noted.json').seen!.states[number - 1]!.state).toBe('seen')
    write(after)
    const again = check('noted.json')
    const index = again.result.lines.findIndex((l) => l.code === code)
    const state = again.seen!.states[index]!
    expect(state.state).toBe('back')
    expect(checkText(again, 1)).toContain(`but ${part} changed since, so it is new again.`)
  })

  // MSG-5: identical notes are one line that lists the rooms (`each`). Its thing is the first
  // room and `also` the others, so the mark is keyed to the line and holds every room's parts.
  describe('a line for several rooms (MSG-5)', () => {
    // The flat's bathroom loses its only door; then the bedroom loses its own: the same note.
    const bathroomOnly = () =>
      edit(flat(), (copy) => {
        copy.openings = copy.openings.filter((o) => o.id !== 'd_bb')
        copy.walls.find((w) => w.id === 'bb')!.kind = 'exterior'
      })
    const both = () => edit(bathroomOnly(), (copy) => { copy.openings = copy.openings.filter((o) => o.id !== 'd_hb') })
    const write = (plan: unknown): void => writeFileSync(join(dir, 'pair.json'), JSON.stringify(plan))
    const doorless = (result: CheckResult): number => result.result.lines.findIndex((l) => l.code === 'room/no-door')

    it('is seen as one note on the next check, and back when one of its rooms changes', async () => {
      write(both())
      const first = check('pair.json')
      const index = doorless(first)
      expect(first.result.lines[index]!.each).toEqual([{ kind: 'room', id: 'bathroom' }, { kind: 'room', id: 'bedroom' }])
      const run = await grid(['check', 'pair.json', '--seen', String(index + 1), '--reason', 'Doors come later', '--by', 'Owner'])
      expect(run.code, run.err).toBe(0)
      const [mark] = readSeen(project, 'pair.json').marks
      expect(mark!.parts.filter((p) => p.kind === 'room').map((p) => p.id)).toEqual(['bathroom', 'bedroom'])

      const again = check('pair.json')
      expect(again.seen!.states[doorless(again)]!.state).toBe('seen')
      expect(checkText(again, 1)).toMatch(/Seen \(1\): .*\n {2}\d+\. finding, rooms? .*"Bathroom", "Bedroom" have no door/)

      // A wall of the bedroom only: the line is back, naming it.
      const taller = edit(both(), (copy) => { copy.walls.find((w) => w.id === 'w2')!.height = 2.9 })
      write(taller)
      const changed = check('pair.json')
      const state = changed.seen!.states[doorless(changed)]!
      expect(state.state).toBe('back')
      expect(checkText(changed, 1)).toContain('but wall "w2" changed since, so it is new again.')
    })

    it('a mark made on one room\'s note finds the line it joins, but never holds: the line is new again', async () => {
      write(bathroomOnly())
      const single = check('pair.json')
      expect(single.result.lines[doorless(single)]!.each).toBeUndefined()
      await grid(['check', 'pair.json', '--seen', String(doorless(single) + 1), '--reason', 'Doors come later', '--by', 'Owner'])
      expect(check('pair.json').seen!.states[doorless(single)]!.state).toBe('seen')

      write(both())
      const grouped = check('pair.json')
      const index = doorless(grouped)
      const state = grouped.seen!.states[index]!
      expect(state.state).toBe('back')
      expect(checkText(grouped, 1)).toMatch(/seen before, by "Owner" on \d{4}-\d{2}-\d{2}: "Doors come later"; but room "bedroom".* changed since, so it is new again\./)

      // Marking the line replaces the room's mark; taking it off leaves none behind.
      await grid(['check', 'pair.json', '--seen', String(index + 1), '--reason', 'Both, later', '--by', 'Owner'])
      expect(readSeen(project, 'pair.json').marks.map((m) => m.reason)).toEqual(['Both, later'])
      expect(check('pair.json').seen!.states[index]!.state).toBe('seen')
      await grid(['check', 'pair.json', '--unseen', String(index + 1)])
      expect(readSeen(project, 'pair.json').marks).toEqual([])
      expect(check('pair.json').seen!.states[index]!.state).toBe('new')
    })
  })

  it('unmarking takes the mark off; marking again replaces it', async () => {
    await grid(['check', 'plan.json', '--country', 'US', '--seen', '1', '--reason', 'First', '--by', 'Owner'])
    await grid(['check', 'plan.json', '--country', 'US', '--seen', '1', '--reason', 'Second', '--by', 'Owner'])
    expect(readSeen(project, 'plan.json').marks.map((m) => m.reason)).toEqual(['Second'])
    const off = await grid(['check', 'plan.json', '--country', 'US', '--unseen', '1'])
    expect(off.out.split('\n')[1]).toMatch(/^Took the seen mark off note 1, in plan\.seen\.json; it is listed as new: /)
    expect(readSeen(project, 'plan.json').marks).toEqual([])
    const again = await grid(['check', 'plan.json', '--country', 'US', '--unseen', '1'])
    expect(again.out.split('\n')[1]).toMatch(/^Note 1 had no seen mark, so nothing was changed: /)
  })

  it('quotes the person\'s words, so a reason is never read as Grid\'s own', async () => {
    await grid(['check', 'plan.json', '--country', 'US', '--seen', '1', '--reason', 'Approved by the owner, complies', '--by', 'Owner'])
    const text = checkText(check('plan.json', { country: 'US' }), 2)
    expect(text).toContain('"Approved by the owner, complies"')
    expect(approvalWords(text)).toEqual([])
  })

  it('--json gives each line\'s state and what was marked', async () => {
    const run = await grid(['check', 'plan.json', '--country', 'US', '--seen', '2', '--reason', 'A ladder, on purpose', '--by', 'Owner', '--json'])
    const json = JSON.parse(run.out) as { seen: { file: string; states: Array<{ state: string }> }; marked: { number: number; code: string } }
    expect(json.seen.file).toBe('plan.seen.json')
    // LVL-14: the loft no stair reaches is a finding now, note 2, and may be set aside as one.
    expect(json.seen.states.map((s) => s.state)).toEqual(['new', 'seen', 'new'])
    expect(json.marked).toMatchObject({ number: 2, code: 'floor/no-stair' })
  })
})

describe('what the plan marks assumed (WRT-6)', () => {
  // Two values of one wall and a whole room, marked assumed: three to-confirm lines, two of
  // them with the same code, thing and parts.
  const MARKS = [
    { part: 'wall', id: 'ext-south', value: 'height', source: 'assumed' },
    { part: 'wall', id: 'ext-south', value: 'thickness', source: 'assumed' },
    { part: 'room', id: 'bed2', source: 'assumed' },
  ]
  const write = (marks: readonly Record<string, unknown>[]): void => {
    writeFileSync(join(dir, 'marked.json'), JSON.stringify({ ...(JSON.parse(FLAT) as Record<string, unknown>), marks }))
  }
  const confirm = (result: CheckResult): number[] => result.result.lines.flatMap((line, index) => (line.kind === 'to-confirm' ? [index + 1] : []))

  it('the short report lists every to-confirm line under To confirm, and grid_check names them', async () => {
    write(MARKS)
    const run = await grid(['check', 'marked.json'])
    expect(run.code).toBe(0)
    const text = run.out
    expect(text).toContain('To look at (3): 3 to confirm.')
    expect(text).toContain('\nTo confirm (3): what the plan marks assumed, not given or measured. Ask the person.\n')
    expect(text).toContain('The height of Wall "ext-south" was assumed, not given or measured. [plan/value-assumed]')
    expect(text).toContain('The thickness of Wall "ext-south" was assumed, not given or measured. [plan/value-assumed]')
    expect(text.match(/\[plan\/value-assumed\]/g)).toHaveLength(3)
    // Short: no fixed tables.
    expect(text).not.toMatch(/Figures used|What these checks never look at \(/)
    const answer = await tool('grid_check').run({ plan: 'marked.json' }, { project })
    expect(answer.text).toContain('To confirm with the person (3), assumed and not given: ')
    expect(answer.text.match(/\[plan\/value-assumed\]/g)).toHaveLength(3)
  })

  it('marking one assumed value seen leaves the other values of that part listed, and a change to its marks brings it back', async () => {
    write(MARKS)
    const first = check('marked.json')
    const [height, thickness, room] = confirm(first)
    expect(first.result.lines[height! - 1]!.message).toContain('The height of Wall "ext-south"')
    const run = await grid(['check', 'marked.json', '--seen', String(height), '--reason', 'Taken from the survey', '--by', 'Owner'])
    expect(run.code, run.err).toBe(0)
    // The mark keeps the message: the two notes on the wall share their code, thing and parts.
    expect(readSeen(project, 'marked.json').marks[0]!.message).toBe(first.result.lines[height! - 1]!.message)

    const seen = check('marked.json')
    expect([height, thickness, room].map((n) => seen.seen!.states[n! - 1]!.state)).toEqual(['seen', 'new', 'new'])
    const text = checkText(seen, 1)
    expect(text).toContain('To confirm (3; 1 of them seen, listed under Seen): what the plan marks assumed, not given or measured. Ask the person.')
    expect(text).toMatch(/Seen \(1\): [^\n]*\n {2}\d+\. to confirm, wall "ext-south": The height of Wall "ext-south" was assumed/)
    const answer = await tool('grid_check').run({ plan: 'marked.json' }, { project })
    expect(answer.text).toContain('To confirm with the person (2), assumed and not given: ')
    expect(answer.text).toMatch(/Seen \(1\): .*\n {2}\d+\. to confirm, wall "ext-south": The height of Wall "ext-south" was assumed/)

    // The mark on the wall's height now says how sure it is: the wall's marks changed, so the
    // note is new again, saying which part.
    write([{ ...MARKS[0]!, tolerance: 0.05 }, MARKS[1]!, MARKS[2]!])
    const again = check('marked.json')
    expect(again.seen!.states[height! - 1]!.state).toBe('back')
    expect(checkText(again, 1)).toContain('but wall "ext-south" changed since, so it is new again.')
  })

  it('a mark made when the note was the only one of its kind on the part holds no more once another joins it', async () => {
    write([MARKS[0]!])
    const run = await grid(['check', 'marked.json', '--seen', '1', '--reason', 'Taken from the survey', '--by', 'Owner'])
    expect(run.code, run.err).toBe(0)
    expect(readSeen(project, 'marked.json').marks[0]!.message).toBeUndefined()
    expect(check('marked.json').seen!.states.map((s) => s.state)).toEqual(['seen'])
    // A second assumed value on the same wall: the mark can't say which note it was, so both are new.
    write([MARKS[0]!, MARKS[1]!])
    expect(check('marked.json').seen!.states.map((s) => s.state)).toEqual(['new', 'new'])
  })
})

describe('the options and the tool are strict', () => {
  it.each([
    [['--reason', 'x'], '--reason goes with --seen <n>'],
    [['--by', 'x'], '--by goes with --seen <n>'],
    [['--seen', '1', '--by', 'x'], '--seen needs --reason'],
    [['--seen', '1', '--reason', 'x'], '--seen needs --by'],
    [['--seen', '1', '--unseen', '1', '--reason', 'x', '--by', 'y'], '--seen and --unseen were both given'],
    [['--seen', 'two', '--reason', 'x', '--by', 'y'], '--seen takes the number of a note in the report'],
    [['--seen', '9', '--reason', 'x', '--by', 'y'], '--seen takes the number of a note in the report, from 1 to 3'],
    [['--unseen', '0'], '--unseen takes the number of a note in the report'],
  ])('%j is refused, and nothing is written', async (args, said) => {
    const run = await grid(['check', 'plan.json', '--country', 'US', ...args])
    expect(run.code).toBe(2)
    expect(run.err).toContain(said)
    expect(readSeen(project, 'plan.json').marks).toEqual([])
  })

  it('a reason over two lines, or empty, is refused without being repeated', async () => {
    const run = await grid(['check', 'plan.json', '--country', 'US', '--seen', '1', '--reason', 'secret words\nmore', '--by', 'Owner'])
    expect(run.code).toBe(1)
    expect(run.err).toContain('The reason holds a line break')
    expect(run.err).not.toContain('secret words')
    expect((await grid(['check', 'plan.json', '--seen', '1', '--reason', ' ', '--by', 'Owner'])).err).toContain('The reason is empty')
  })

  it('a plan with no notes has none to mark', async () => {
    const run = await grid(['check', 'flat.json', '--seen', '1', '--reason', 'x', '--by', 'y'])
    expect([run.code, run.err]).toEqual([2, 'grid: --seen: the report has no notes to mark.\n'])
  })

  it('grid_mark_seen marks by number and code, refuses a number that names another code, and needs the person\'s words', async () => {
    const mark = tool('grid_mark_seen')
    await expect(Promise.resolve().then(() => mark.run({ plan: 'plan.json', line: 3, code: 'room/too-small', reason: 'x', by: 'y', country: 'US' }, { project }))).rejects.toThrow('Note 3 is room/escape-window-too-small now, not the code sent')
    await expect(Promise.resolve().then(() => mark.run({ plan: 'plan.json', line: 3, code: 'room/escape-window-too-small', by: 'y', country: 'US' }, { project }))).rejects.toThrow('Pass reason')
    await expect(Promise.resolve().then(() => mark.run({ plan: 'plan.json', line: 3, code: 'room/escape-window-too-small', reason: 'x', country: 'US' }, { project }))).rejects.toThrow('Pass by')
    await expect(Promise.resolve().then(() => mark.run({ plan: 'plan.json', line: 3, code: 'room/escape-window-too-small', unmark: true, reason: 'x', country: 'US' }, { project }))).rejects.toThrow('leave out reason and by')
    expect(readSeen(project, 'plan.json').marks).toEqual([])
    const answer = await mark.run({ plan: 'plan.json', line: 3, code: 'room/escape-window-too-small', reason: 'To be enlarged', by: 'Owner', country: 'US' }, { project })
    expect(answer.data).toMatchObject({ written: 'plan.seen.json', line: 3, code: 'room/escape-window-too-small', unmarked: false, mark: { reason: 'To be enlarged', by: 'Owner' } })
    expect(answer.text).toContain('It stays listed, under Seen')
    const off = await mark.run({ plan: 'plan.json', line: 3, code: 'room/escape-window-too-small', unmark: true, country: 'US' }, { project })
    expect(off.data).toMatchObject({ unmarked: true })
    expect(readSeen(project, 'plan.json').marks).toEqual([])
  })
})

describe('the marks file', () => {
  it('sits beside the plan, named after it', () => {
    expect(seenFileOf('plan.json')).toBe('plan.seen.json')
    expect(seenFileOf(join('options', 'b.json'))).toBe(join('options', 'b.seen.json'))
  })

  it.each([
    [[], 'it must be a JSON object with version and marks'],
    [{ version: '2', marks: [] }, 'version must be "1"'],
    [{ version: '1', marks: {} }, 'marks must be a list'],
    [{ version: '1', marks: [{ code: 'room/too-small' }] }, 'marks[0].thing must be an object with a kind and an id'],
    [{ version: '1', marks: [], extra: 1 }, 'the file holds a field Grid does not know'],
  ])('%j is refused, naming the place', (raw, said) => {
    expect(() => parseSeen(raw)).toThrow(SeenRefused)
    expect(() => parseSeen(raw)).toThrow(said)
  })

  it('that cannot be read is said in the report, every note is new, and no mark is written over it', async () => {
    writeFileSync(join(dir, 'plan.seen.json'), '{ not json, "by": "A. Person"')
    const result = check('plan.json', { country: 'US' })
    expect(result.seen!.states.every((s) => s.state === 'new')).toBe(true)
    const text = checkText(result, 2)
    expect(text).toContain('The seen marks were not all read: plan.seen.json is not JSON. A note whose mark was not read is listed as new.')
    expect(text).not.toContain('A. Person')
    const run = await grid(['check', 'plan.json', '--country', 'US', '--seen', '1', '--reason', 'x', '--by', 'y'])
    expect(run.code).toBe(1)
    expect(run.err).toContain('Nothing was marked: plan.seen.json is not JSON')
    expect(readFileSync(join(dir, 'plan.seen.json'), 'utf8')).toBe('{ not json, "by": "A. Person"')
  })
})
