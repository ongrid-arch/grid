/**
 * `grid check <plan>`: the result record of `@ongrid/rules` (`inspectPlan`, MSG-1): the drawing's
 * problems, the door sweeps, the findings and what was not checked, in one list with one count,
 * as text for a person or as JSON for a program.
 *
 * Every report starts with the label "General guidance, not your local rules". No line says a
 * plan complies, passes or is approved: no findings only means these checks found nothing.
 */
import { floorOf, LIMITS as PLAN_LIMITS, PLAN_LIMIT_KEYS, spokenIn, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import {
  buildingKindsSaid,
  buildingTypeSaid,
  checkLocalRules,
  FIGURE_CHECK_SUBJECTS,
  FIGURE_RULES,
  RULE_READ_FOR,
  noPlaceSaid,
  PlaceRefused,
  requestedPlace,
  coverageOnFloor,
  figureUsedSaid,
  inspectPlan,
  isFirmLine,
  problemsIn,
  roomsLookedAt,
  FIGURE_LIMIT_KEYS,
  FIGURE_LIMITS,
  LINE_KINDS,
  type AppliedFigure,
  type Cause,
  type CheckCoverage,
  type FirmInput,
  type FirmUsed,
  type GridResult,
  type LineKind,
  type ResultLine,
  type RulesReport,
} from '@ongrid/rules'
import { en, english, joined, labelOfUse, name, said, type Language, type MessageKey, type Said, type Value } from '@ongrid/floorplan/messages'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { floorOption } from './plan'
import { inLanguage, reportLanguage, t, tv } from './words'
import type { LoadedPlan } from './plan'
import { LANG_OPTION } from './language'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'
import type { Project } from '../fs/projectFiles'
import { markDay, markSeen, partText, seenStates, unmarkSeen, type SeenMark, type SeenRead, type SeenState } from '../seen/marks'
import { tapedTable } from '../taped/table'

export const CHECK_OPTIONS: OptionSpecs = {
  '--floor': { takesValue: true, help: 'Only show what was found on this floor (a floor id from the plan).' },
  '--country': {
    takesValue: true,
    help: 'Where the plan will be built, for this check, in place of the plan\'s site.country: a country\'s name or its two- or three-letter code, such as US, USA, United States or Spain.',
  },
  '--json': { takesValue: false, help: 'Print the report as JSON.' },
  // CMD-48: what fails a build: exit 3 after the report.
  '--fail-on': { takesValue: true, help: 'Exit 3, after printing the report, when problems: there is a problem to act on; notes: there is a note not set aside as seen.' },
  // MSG-10: the report is short by default; this gives every section.
  '--full': { takesValue: false, help: 'Print the whole report: the checks run, every figure, what each check looked at part by part, and what these checks never look at.' },
  // MSG-10: a note set aside as seen, with the person's reason and name, in the marks file beside the plan.
  '--seen': { takesValue: true, help: 'Mark the note of this number as seen, with --reason and --by. It stays listed, under Seen, and is new again when one of its parts changes.' },
  '--unseen': { takesValue: true, help: 'Take the seen mark off the note of this number.' },
  '--reason': { takesValue: true, help: 'With --seen: why the note is set aside, in one line.' },
  '--by': { takesValue: true, help: 'With --seen: who marks it, as the name or role you give. It is kept only in the marks file beside the plan.' },
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}

export interface CheckRequest {
  readonly floor?: string
  readonly country?: string
  readonly json: boolean
  /** MSG-11: the language the record and the report are written in; English when not given. Its messages must be loaded. */
  readonly language?: Language
  /** COD-8: the firm's standards beside the plan, measured on it (`firmForCheck`). */
  readonly firm?: FirmInput
}

export interface CheckResult {
  /** The label, in the report's language. */
  readonly label: string
  /** MSG-11: the language the report is written in, and its decimal mark, when it is not English. */
  readonly language?: Language
  readonly decimal?: 'point' | 'comma'
  /** Only when the check was asked about one floor. */
  readonly floor?: string
  /** Problems with the drawing itself: what can't be drawn, and what is worth a look. */
  readonly issues: readonly Issue[]
  readonly report: RulesReport
  /** Everything above, and the door sweeps, as one list with one count (MSG-1). On one floor, its lines and the plan's. */
  readonly result: GridResult
  /**
   * Each of `result.lines`' number: its place from 1 in the whole plan's record, so a line keeps
   * its number on one floor, and a drawing marks it with the same one (MSG-8).
   */
  readonly numbers: readonly number[]
  /**
   * MSG-2 (lab W-8): how many of the rooms at least one check looked at, and those none did,
   * printed beside the count of lines. On one floor, that floor's rooms.
   */
  readonly rooms: ReturnType<typeof roomsLookedAt>
  /**
   * MSG-10: how each of `result.lines` stands against the seen marks beside the plan, when they
   * were read. Absent for a check that read no marks file.
   */
  readonly seen?: CheckSeen
}

/** MSG-10: the seen marks as a check read them. */
export interface CheckSeen {
  /** The marks file, relative to the project folder. */
  readonly file: string
  /** Why the marks file could not be read: then every note is new. */
  readonly problem: string | null
  /** Each of `result.lines`' state, in their order. */
  readonly states: readonly SeenState[]
}

/** MSG-10: the check with how each of its lines stands against the marks read beside the plan. */
export function withSeen(result: CheckResult, loaded: Pick<LoadedPlan, 'plan' | 'text'>, read: SeenRead): CheckResult {
  return { ...result, seen: { file: read.file, problem: read.problem, states: seenStates(loaded, result.result.lines, read.marks) } }
}

/** CMD-48: what `--fail-on` stops a build on. */
export type CheckFailOn = 'problems' | 'notes'

export function checkFailOn(word: string | undefined): CheckFailOn | null {
  if (word === undefined) return null
  if (word === 'problems' || word === 'notes') return word
  throw new UsageError('--fail-on takes problems or notes.')
}

/** CMD-48: whether the check holds what `--fail-on` named: a problem to act on, or a note not seen. */
export function checkFails(result: CheckResult, failOn: CheckFailOn): boolean {
  return failOn === 'problems' ? result.result.problems > 0 : result.result.count - seenCount(result) > 0
}

/** MSG-10: how many of the check's lines are seen, with a mark that still holds. */
export function seenCount(result: CheckResult): number {
  return (result.seen?.states ?? []).filter((s) => s.state === 'seen').length
}

/** "by "A. Person" on 2026-11-22: "Kept small on purpose"": the person's words, quoted. */
export function seenByText(mark: SeenMark): string {
  return t('report.seenBy', { by: name(mark.by), day: markDay(mark), reason: name(mark.reason) })
}

/** A note whose parts changed since it was marked: new again, and why. */
export function seenBeforeText(state: Extract<SeenState, { state: 'back' }>): string {
  const changed = state.changed.slice(0, 4).map(partText).join(', ')
  const parts = state.changed.length > 4 ? said('line.part.andMore', { shown: changed, more: state.changed.length - 4 }) : changed
  return t('report.seenBefore', { by: seenByText(state.mark), parts })
}

/** MSG-10: what a request to mark a note asks: its number in the whole plan's report, and what to do. */
export type MarkAsk =
  | { readonly mark: 'seen'; readonly number: number; readonly reason: string; readonly by: string; readonly at?: string }
  | { readonly mark: 'unseen'; readonly number: number }

/** MSG-10: what marking did, in one line for the report, and as data. */
export interface MarkDone {
  readonly text: string
  readonly number: number
  readonly code: string
  readonly file: string
  /** The mark written, or the one taken off; null when there was none to take off. */
  readonly mark: SeenMark | null
  readonly unmarked: boolean
}

/**
 * The line of a number in the whole plan's report, or why there is none. `whole` is the check of
 * the whole plan, so a number means what `grid check` and `grid_check` print beside it.
 */
export function lineOfNumber(whole: CheckResult, number: number, argument: string): ResultLine {
  const count = whole.result.count
  if (count === 0) throw new UsageError(`${argument}: the report has no notes to mark.`)
  const line = Number.isInteger(number) ? whole.result.lines[number - 1] : undefined
  if (line === undefined) throw new UsageError(`${argument} takes the number of a note in the report, from 1 to ${count}.`)
  return line
}

/** MSG-10: marks a note of the whole plan's report as seen, or takes its mark off, in the marks file beside the plan. */
export function markNote(project: Project, planFile: string, loaded: LoadedPlan, whole: CheckResult, ask: MarkAsk, argument: string): MarkDone {
  const line = lineOfNumber(whole, ask.number, argument)
  const note = t('report.note', { kind: kindWord(line.kind), thing: thingText(line), message: line.message, code: line.code })
  if (ask.mark === 'unseen') {
    const { file, removed } = unmarkSeen(project, planFile, line, whole.result.lines)
    const text = removed === null ? t('report.mark.none', { number: ask.number, note }) : t('report.mark.off', { number: ask.number, file, note })
    return { text, number: ask.number, code: line.code, file, mark: removed, unmarked: removed !== null }
  }
  // MSG-29: the country the check was given, so a change counts the note again with it.
  const place = whole.report.place
  const country = place !== null && place.from === 'request' ? { country: place.country } : {}
  const { file, mark } = markSeen(project, planFile, loaded, line, { reason: ask.reason, by: ask.by, ...(ask.at ? { at: ask.at } : {}), ...country }, whole.result.lines)
  const parts = mark.parts.slice(0, 4).map(partText).join(', ')
  const when = mark.parts.length === 1 ? parts : mark.parts.length > 4 ? t('report.mark.oneOfMore', { parts, more: mark.parts.length - 4 }) : t('report.mark.oneOf', { parts })
  const text = t('report.mark.seen', { number: ask.number, by: seenByText(mark), file, note, when })
  return { text, number: ask.number, code: line.code, file, mark, unmarked: false }
}

/** What the Seen part says of itself: never that a note is dealt with. */
export const SEEN_HEADING_NOTE = english(said('report.seenNote'))

/** What no findings means, said wherever a check reports none. */
export const NOTHING_FOUND = english(said('report.nothingFound'))
/** MSG-3: what a report says when no check looked at anything. */
export const NOTHING_CHECKED = english(said('report.nothingChecked'))

/** MSG-3: a check that looked at nothing, said as such. */
export function nothingCheckedText(title: string, looksAt: CheckCoverage['looksAt']): string {
  return t('report.nothingCheckedFor', { title, parts: said(`report.parts.${looksAt}.none`) })
}

/** MSG-11: a check's title in the report's language, by its id; the record's own when Grid has none. */
export function checkTitle(check: Pick<CheckCoverage, 'ruleId' | 'title'>): string {
  const key = `check.title.${check.ruleId}`
  return Object.hasOwn(en, key) ? t(key as MessageKey) : check.title
}

/** The floor each wall, room and opening is on. */
function floorsById(plan: FloorPlan): Map<string, string> {
  const floors = new Map<string, string>()
  for (const wall of plan.walls) floors.set(wall.id, floorOf(wall))
  for (const room of plan.rooms) floors.set(room.id, floorOf(room))
  for (const opening of plan.openings) {
    const wall = plan.walls.find((w) => w.id === opening.wall)
    if (wall) floors.set(opening.id, floorOf(wall))
  }
  // Set last: an item's own id never takes another part's floor (`item/duplicate-id` says so).
  for (const item of plan.items ?? []) if (!floors.has(item.id)) floors.set(item.id, floorOf(item))
  return floors
}

/**
 * COD-3: the place a caller named, as its two-letter code, or undefined when none was named. A
 * place not on Grid's list is refused, naming `argument` and never the text given (T-2, MSG-9).
 */
export function countryOption(country: string | undefined, argument = '--country'): string | undefined {
  try {
    return requestedPlace(country, argument)?.country
  } catch (error) {
    if (error instanceof PlaceRefused) throw new UsageError(`${error.message}.`)
    throw error
  }
}

/**
 * What a request to check is told about where the place came from, for the report's first line:
 * from the command (`--country`), the tool (`the country argument`) or the sheet, by its words
 * (`report.place.request.*`, `report.place.give.*`; never "pass": MSG-3).
 */
export type PlaceWords = 'command' | 'tool' | 'sheet'

/**
 * COD-3: the report's first line after the label: the place the figure checks were for, from
 * Grid's list, where it came from and which figures were applied; or, with no place, that no
 * figure was applied and how many lines the US figures would have given.
 */
export function placeText(report: Pick<RulesReport, 'place' | 'withoutPlace' | 'figures' | 'notChecked'>, words: PlaceWords = 'command'): string {
  const { place } = report
  if (place === null) return t('report.place.none', { noPlace: noPlaceSaid(), give: said(`report.place.give.${words}`) })
  const from =
    place.from === 'request'
      ? said('report.place.from.request', { request: said(`report.place.request.${words}`) })
      : said(place.from === 'plan' ? 'report.place.from.plan' : 'report.place.from.assumed')
  const where = [...new Set(report.figures.flatMap((figure) => (figure.origin === 'baseline' ? [figure.jurisdiction] : [])))]
  const lookedUp = report.figures.some((figure) => figure.origin === 'lookup')
  const applied: Value[] = [...where.map((w) => said('report.place.appliedFrom', { where: w })), ...(lookedUp ? [said('report.place.lookedUp')] : [])]
  // COD-2: the kind of building the figures were read for, by its word alone: the notes that used one give it in full.
  const kinds = [...new Set(report.figures.map((figure) => figure.readFor))].map((kind) => said(`check.kindWord.${kind}`))
  // CNT-5: the place has figures, and the kind of building the plan states is not one they were read for.
  const notFor = report.notChecked.filter((n) => n.reason === 'not_for_building' && n.building !== undefined)
  const readFor = [...new Set(FIGURE_RULES.flatMap((rule) => RULE_READ_FOR[rule.id]))].map((kind) => said(`check.kindWord.${kind}`))
  const building =
    notFor.length === 0
      ? null
      : notFor.some((n) => n.floor === '')
        ? said('report.place.building.plan', { building: buildingTypeSaid(notFor.find((n) => n.floor === '')!.building!) })
        : said('report.place.building.floors')
  const figures =
    applied.length > 0
      ? said('report.place.figures', { applied: joined(applied, 'join.and'), kinds: joined(kinds, 'join.and') })
      : place.country !== 'US'
        ? said('report.place.noFigures')
        : building !== null
          ? said('report.place.notForBuilding', { readFor: joined(readFor, 'join.and'), building })
          : said('report.place.nothingToLook')
  return t('report.place', { place: place.name, from, figures })
}

export function checkPlan(loaded: LoadedPlan, request: Omit<CheckRequest, 'json'>, argument = '--country'): CheckResult {
  // MSG-22: the floor the plan names in no list, named in the language of the check.
  const plan = spokenIn(loaded.plan, request.language ?? loaded.plan.display?.language)
  const country = countryOption(request.country, argument)
  const floor = floorOption(plan, request.floor)
  const options = country === undefined ? {} : { country }
  // MSG-5: with what the reader left out, so the report holds back what the record holds back.
  const full = checkLocalRules(plan, { ...options, leftOut: loaded.leftOut ?? [] })
  // MSG-11: the language asked for, else the plan's, with the plan's decimal mark when it states one.
  const language = request.language ?? plan.display?.language
  const decimal = plan.display?.decimal
  const speech = language === undefined || language === 'en' ? {} : { language, ...(decimal === undefined ? {} : { decimal }) }
  // The file's text (MSG-6), so the record names what the reader did and the words the schema
  // drops (MSG-4).
  // COD-8: the firm's own standards beside the plan, when it has a file of them. CNT-10: a
  // fit-out's base, which the record reads in as the command did. MSG-20: the trace image the
  // command could not follow in the project folder.
  const result = inspectPlan(loaded.text ?? plan, {
    ...options,
    ...speech,
    ...(request.firm === undefined ? {} : { firm: request.firm }),
    ...(loaded.base === undefined ? {} : { base: loaded.base.plan }),
    ...(loaded.trace === undefined ? {} : { trace: loaded.trace }),
  })
  const whole: CheckResult = { label: result.label, ...speech, issues: loaded.issues, report: full, result, rooms: roomsLookedAt(plan, result.coverage), numbers: result.lines.map((_, index) => index + 1) }
  return floor === undefined ? whole : checkOnFloor(loaded, whole, floor)
}

/** What a check of the whole plan found on one floor, without running the rules again. */
export function checkOnFloor(loaded: LoadedPlan, whole: CheckResult, floor: string): CheckResult {
  const full = whole.report
  const report: RulesReport = {
    ...full,
    findings: full.findings.filter((finding) => finding.floor === floor),
    // A notice about the whole plan has no floor, and holds for every floor.
    notChecked: full.notChecked.filter((notice) => notice.floor === floor || notice.floor === ''),
    coverage: coverageOnFloor(full.coverage, floor),
  }
  const result = resultOnFloor(whole.result, floor)
  const numbers = result.lines.map((line) => whole.numbers[whole.result.lines.indexOf(line)] ?? 0)
  const speech = whole.language === undefined ? {} : { language: whole.language, ...(whole.decimal === undefined ? {} : { decimal: whole.decimal }) }
  return { label: whole.label, ...speech, floor, issues: floorIssues(loaded, floor), report, result, rooms: roomsLookedAt(loaded.plan, result.coverage, floor), numbers }
}

/** The record's lines on one floor, and those about the whole plan, counted again. */
export function resultOnFloor(result: GridResult, floor: string): GridResult {
  const lines = result.lines.filter((line) => line.floor === null || line.floor === floor)
  const counts = Object.fromEntries(Object.keys(result.counts).map((kind) => [kind, lines.filter((l) => l.kind === kind).length])) as Record<LineKind, number>
  return {
    ...result,
    lines,
    count: lines.length,
    counts,
    problems: problemsIn(lines),
    coverage: coverageOnFloor(result.coverage, floor),
    // HND-11: the taped lengths of the floor's rooms.
    ...(result.taped === undefined ? {} : { taped: result.taped.filter((row) => row.floor === floor) }),
  }
}

/**
 * MSG-5 (lab W-7): how many of the lines are problems of their own, when some follow from
 * others: " 1 problem; 19 lines follow from it." Empty when every line stands alone.
 */
export function problemsText(result: GridResult): string {
  const following = result.lines.filter((line) => line.causedBy !== undefined).length
  if (following === 0) return ''
  const problems = t(result.problems === 1 ? 'report.problems.one' : 'report.problems.many', { count: result.problems })
  const follow = t(following === 1 ? 'report.follow.one' : 'report.follow.many', { count: following })
  return t(result.problems === 1 ? 'report.problemsFollow.one' : 'report.problemsFollow.many', { problems, follow })
}

/** The line a line follows from, as `wall "w1" (wall/zero-length)` or `the plan (plan/no-walls)`. */
export function causeText(cause: Cause): string {
  return cause.id === '' ? t('report.cause.plan', { code: cause.code }) : t('report.cause', { id: name(cause.id), code: cause.code })
}

/** MSG-5: the notes a "could not be drawn" line holds back, one line each: `room "p01" (room/no-door), waits for "corridor"`. */
export function heldText(line: ResultLine): string[] {
  return (line.held ?? []).map((note) =>
    t('report.held', {
      thing: note.thing.kind === 'plan' ? t('report.thing.plan') : t(`report.thing.${note.thing.kind}`, { id: name(note.thing.id) }),
      code: note.code,
      waitsFor: joined(note.waitsFor.map(name), 'join.comma')
    })
  )
}

/** What each kind of line is called in a list, in English (`report.kind.*`). */
export const KIND_WORDS: Record<LineKind, string> = Object.fromEntries(LINE_KINDS.map((kind) => [kind, english(said(`report.kind.${kind}`))])) as Record<LineKind, string>

/** What a kind of line is called in the report's language. */
export const kindWord = (kind: LineKind): string => t(`report.kind.${kind}`)

/** How many lines of each kind, as "2 worth a look, 1 finding". */
export function countsText(result: GridResult): string {
  // COD-8: how many of the findings are the firm's own, so they are never read as a code's.
  const firm = result.lines.filter((line) => line.kind === 'finding' && isFirmLine(line)).length
  const firmWords = (kind: LineKind): string => (kind !== 'finding' || firm === 0 ? '' : firm === result.counts[kind] ? t('report.count.firm.all') : t('report.count.firm.some', { count: firm }))
  return LINE_KINDS.filter((kind) => result.counts[kind] > 0)
    .map((kind) => t(result.counts[kind] === 1 ? `report.count.${kind}.one` : `report.count.${kind}.many`, { count: result.counts[kind] }) + firmWords(kind))
    .join(', ')
}

/** COD-8: the firm's lines' heading: whose figures they are, from which file, and that no place limits them. */
export function firmHeadingText(firm: FirmUsed, notes: number): string {
  return t('report.firm.heading', { title: said('report.firm.title'), count: notes, file: name(firm.file), note: said('report.firm.note') })
}

/** COD-8: what the firm's file gave when none of its standards gave a note, in one line; null when it gave notes, or there is no firm's file. */
export function firmNoNoteText(result: GridResult): string | null {
  const firm = result.firm
  if (firm === undefined || !firm.read) return null
  if (result.lines.some(isFirmLine)) return null
  const looked = firm.standards.reduce((n, s) => n + s.lookedAt, 0)
  return t('report.firm.none', {
    title: said('report.firm.title'),
    file: name(firm.file),
    standards: said(firm.standards.length === 1 ? 'report.firm.standards.one' : 'report.firm.standards.many', { count: firm.standards.length }),
    parts: said(looked === 1 ? 'report.firm.parts.one' : 'report.firm.parts.many', { count: looked }),
    note: said('report.firm.noteFirst'),
  })
}

/** COD-8: a room use as the firm's file names it, in the report's language when it is one of Grid's uses. */
const useWord = (use: string, language: Language): string => (language === 'en' || !(ROOM_USES as readonly string[]).includes(use) ? use : labelOfUse(language, use as RoomUse))

/** COD-8: each of the firm's standards, the figure used here, and what it looked at, for the whole report. */
export function firmStandardsText(firm: FirmUsed): string[] {
  const language = reportLanguage()
  return firm.standards.map((s) =>
    t('report.firm.standard', {
      what: said(`line.part.firm.what.${s.measure}`),
      named: s.name === null ? '' : said('line.part.firm.named', { name: name(s.name) }),
      value: s.value,
      unit: s.unit,
      scope: s.uses.length > 0 ? said('report.firm.scope.uses', { uses: s.uses.map((use) => useWord(use, language)).join(', ') }) : s.kinds.length > 0 ? said('report.firm.scope.kinds', { kinds: s.kinds.join(', ') }) : '',
      parts: said(s.lookedAt === 1 ? 'report.firm.parts.one' : 'report.firm.parts.many', { count: s.lookedAt }),
      short: s.notes,
      note: s.note === null ? '' : said('report.firm.firmNote', { note: name(s.note) }),
    }),
  )
}

/** COD-8: the title of the whole report's list of the firm's standards. */
export const firmSectionTitle = (firm: FirmUsed): string => t('report.firm.section', { title: said('report.firm.title'), file: name(firm.file) })

/** The thing a line is about, as `opening "d1"` or `the plan`. */
export function thingText(line: ResultLine): string {
  return line.thing.kind === 'plan' ? t('report.thing.plan') : t(`report.thing.${line.thing.kind}`, { id: name(line.thing.id) })
}

/** The drawing's problems on one floor. A problem with the plan itself holds for every floor. */
export function floorIssues(loaded: LoadedPlan, floor: string): readonly Issue[] {
  const on = floorsById(loaded.plan)
  // A `floor` issue (enclosed floor no room claims) has the floor itself as its id.
  return loaded.issues.filter((issue) =>
    issue.entity === 'plan' || (issue.entity === 'floor' ? issue.id === floor : (on.get(issue.id) ?? floor) === floor))
}

function section(title: string, lines: readonly string[]): string[] {
  return ['', t('report.section', { title, count: lines.length }), ...lines.map((line) => `  - ${line}`)]
}

export interface TextOptions {
  /** MSG-10: every section: the checks run, every figure, the long coverage and the limits. */
  readonly full?: boolean
}

/** MSG-11: a check as `grid check --full` lists it: its title and its source, in the report's language. */
export function ruleText(rule: { readonly id: string; readonly title: string; readonly source: { readonly kind: string; readonly label: string } }): string {
  const source = rule.source.kind === 'plan-sanity' ? t('check.source.planSanity') : rule.source.label
  return `${checkTitle({ ruleId: rule.id, title: rule.title })} (${source})`
}

/** MSG-11: the limits, in the report's language: the record keeps them by place, in the order of their keys. */
export function limitsText(limits: readonly string[]): string[] {
  const keys = [...PLAN_LIMIT_KEYS, ...FIGURE_LIMIT_KEYS]
  return limits.map((limit) => {
    const at = [...PLAN_LIMITS, ...FIGURE_LIMITS].indexOf(limit)
    return at === -1 ? limit : t(keys[at]!)
  })
}

/** One line of the list, with what was found and needed and the fix. */
function lineText(result: CheckResult, index: number, floorCount: number, details: boolean): string[] {
  const line = result.result.lines[index]!
  const where = floorCount > 1 && line.floor !== null && line.thing.kind !== 'floor' ? t('report.on', { floor: name(line.floor) }) : ''
  // MSG-5: a line that follows from another is set under it, says which, and names the notes it holds back.
  const indent = line.causedBy === undefined ? '' : '    '
  const head = `${indent}  ${result.numbers[index]}. ${t('report.line', { kind: kindWord(line.kind), thing: thingText(line), where, message: line.message, code: line.code })}`
  const cause = line.causedBy === undefined ? [] : [`${indent}      ${t('report.followsFrom')}: ${causeText(line.causedBy)}`]
  if (!details) return [head, ...cause]
  return [
    head,
    ...cause,
    `${indent}      ${t('report.found')}: ${line.found}`,
    `${indent}      ${t('report.needed')}: ${line.needed}`,
    `${indent}      ${t('report.fix')}: ${line.fix}`,
    ...heldText(line).map((held) => `${indent}      ${t('report.heldBack')}: ${held}`),
  ]
}

/** MSG-10: the figures the lines used, once each, as the figure used here with its basis and status. */
export function figuresOfLines(lines: readonly ResultLine[]): AppliedFigure[] {
  const figures: AppliedFigure[] = []
  const taken = new Set<string>()
  for (const figure of lines.flatMap((line) => line.figures ?? [])) {
    const key = JSON.stringify(figure)
    if (taken.has(key)) continue
    taken.add(key)
    figures.push(figure)
  }
  return figures
}

/** MSG-10: where the rest of a short report is: what `--full` (the command) or `full=true` (the tool) adds. */
export function restText(report: RulesReport, option = '--full'): string {
  return t('report.rest', { option, count: report.limits.length })
}

/** MSG-10: how many checks ran, and where they are listed; MSG-3's words when none did. */
export function checksRunText(report: RulesReport): string {
  return `${report.rules.length === 0 ? t('report.checksRun.none') : t('report.checksRun', { count: report.rules.length })} ${restText(report)}`
}

/**
 * The report as plain text. It always starts with the label.
 *
 * MSG-10: short by default, and about this plan: the lines, the figures they used, what each
 * check looked at in counts, and where the rest is. `full` gives every section, as before. A
 * seen line is listed under Seen, never left out; a line seen before whose parts changed is
 * listed with the others, and says so.
 */
export function checkText(result: CheckResult, floorCount: number, options: TextOptions = {}): string {
  return inLanguage(result.language, result.decimal, () => reportText(result, floorCount, options))
}

function reportText(result: CheckResult, floorCount: number, options: TextOptions): string {
  const full = options.full === true
  const { report } = result
  // COD-3: right after the label, the place and the figures applied, or that none was.
  const lines: string[] = [result.label, placeText(report)]
  if (report.lookupNotice) lines.push(t('check.lookupNotice'))
  if (result.floor !== undefined) lines.push(t('report.floorOnly', { floor: result.floor }))

  if (full) {
    // MSG-3: an empty list is said in words, never left as a heading over nothing.
    if (report.rules.length === 0) lines.push('', t('report.checksRun.none'))
    else lines.push(...section(t('report.checksRun.title'), report.rules.map(ruleText)))
  }
  if (result.seen?.problem) lines.push('', t('report.seenUnread', { problem: result.seen.problem }))

  // One list, one count (MSG-1): the drawing's problems, the door sweeps, the findings and what
  // was not checked, each with its code, what was found and needed, and the fix.
  const record = result.result
  const states = result.seen?.states ?? []
  const seen = seenCount(result)
  if (record.count === 0) {
    lines.push('', t('report.toLook.none'))
  } else {
    lines.push('', t('report.toLook', { count: record.count, counts: countsText(record), seen: seen > 0 ? t('report.ofThemSeen', { count: seen }) : '' }) + problemsText(record))
    // Numbered by place in the whole plan's record: `grid draw` marks each with its number (MSG-8).
    // MSG-5: a line that follows from another is set under it, and says which (`lineText`).
    // WRT-6 (lab WR-15): what was assumed comes last, under its own heading, for the person. A
    // seen one is under Seen with the others (MSG-10), so the heading comes before the first open one.
    const confirmSeen = record.lines.filter((line, index) => line.kind === 'to-confirm' && states[index]?.state === 'seen').length
    let confirmHeading = false
    // COD-8: the firm's own standards under their own heading, apart from the code figures.
    const firmOpen = record.lines.filter((line, index) => isFirmLine(line) && states[index]?.state !== 'seen').length
    let firmHeading = false
    record.lines.forEach((line, index) => {
      const state = states[index]
      if (state?.state === 'seen') return
      if (isFirmLine(line) && !firmHeading && record.firm !== undefined) {
        firmHeading = true
        lines.push('', firmHeadingText(record.firm, firmOpen))
      }
      if (line.kind === 'to-confirm' && !confirmHeading) {
        confirmHeading = true
        lines.push('', t('report.toConfirm', { count: record.counts['to-confirm'], seen: confirmSeen > 0 ? t('report.ofThemSeen', { count: confirmSeen }) : '' }))
      }
      lines.push(...lineText(result, index, floorCount, true))
      if (state?.state === 'back') lines.push(`${line.causedBy === undefined ? '' : '    '}      ${seenBeforeText(state)}.`)
    })
    const codeFindings = record.lines.filter((line) => line.kind === 'finding' && !isFirmLine(line)).length
    if (record.counts.finding === 0) lines.push('', t('report.noFindings'))
    else if (codeFindings === 0) lines.push('', t('report.firm.noCodeFindings', { nothing: said('report.nothingFound') }))
    if (seen > 0) {
      lines.push('', t('report.seenHeading', { count: seen }))
      record.lines.forEach((_, index) => {
        const state = states[index]
        if (state?.state !== 'seen') return
        lines.push(...lineText(result, index, floorCount, full), `      ${t('report.seenLine', { by: seenByText(state.mark) })}`)
      })
    }
  }

  // COD-8: a firm's file whose standards gave no note still says it was read.
  const firmNone = firmNoNoteText(record)
  if (firmNone !== null) lines.push('', firmNone)

  // HND-11 (lab WR-14): each length taped on site against the drawing, after every run.
  const taped = tapedTable(record.taped ?? [])
  if (taped.length > 0) lines.push('', ...taped)

  if (full) {
    lines.push(...coverageText(result))
    // MSG-3: each as the figure used here, with its basis and its status.
    if (report.figures.length > 0) lines.push(...section(t('report.figuresUsed'), report.figures.map((figure) => tv(figureUsedSaid(figure)))))
    // COD-8: the firm's own standards, apart from the code figures: the firm's, not a code's.
    if (record.firm !== undefined && record.firm.read) lines.push(...section(firmSectionTitle(record.firm), firmStandardsText(record.firm)))
    lines.push(...section(t('report.neverLooked'), limitsText(report.limits)))
  } else {
    // MSG-10: only the figures a line used, each still with its document, edition, clause and status.
    const used = figuresOfLines(record.lines)
    if (used.length > 0) lines.push(...section(t('report.figuresNotesUsed'), used.map((figure) => tv(figureUsedSaid(figure)))))
    lines.push(...coverageSummary(result))
    lines.push('', checksRunText(report))
  }
  return `${lines.join('\n')}\n`
}

/** "3 rooms", "1 floor". */
export function partsText(count: number, looksAt: CheckCoverage['looksAt']): string {
  return t('report.partsCount', { count, parts: said(`report.parts.${looksAt}.${count === 1 ? 'one' : 'many'}`) })
}

/** At most `most` ids in quotes, then how many more. */
function idsText(ids: readonly string[], most = 8): string {
  const shown = joined(ids.slice(0, most).map(name), 'join.comma')
  return tv(ids.length > most ? said('line.part.andMore', { shown, more: ids.length - most }) : shown)
}

/** MSG-11: why a check skipped parts, in the report's language. */
function whyText(skip: { readonly why: string; readonly said?: Said }): string {
  return skip.said === undefined ? skip.why : tv(skip.said)
}

/** "1 finding", "2 findings". */
const findingsText = (count: number): string => t(count === 1 ? 'report.count.finding.one' : 'report.count.finding.many', { count })

/**
 * What each check looked at (MSG-2, lab CH-1, CH-4): its count beside the count of lines, then each
 * check with the parts it looked at and the parts it skipped, with the reason and a count. An
 * empty list of lines is read with it: it only says what these parts gave.
 */
/** COD-2: a line held to a figure check, whose `needed` names the kind of building it was read for. */
export function usedFigures(line: ResultLine): boolean {
  return (line.figures?.length ?? 0) > 0 || line.code === 'room/no-escape-opening'
}

/**
 * COD-2: for a check that applied figures, the kind of building they were read for, after its
 * count of findings, so a pass with none still says it: "; its figures were read for homes (…)".
 */
export function readForText(check: Pick<CheckCoverage, 'readFor'>): string {
  return check.readFor === undefined || check.readFor.length === 0 ? '' : t('report.itsFiguresFor', { kinds: buildingKindsSaid(check.readFor) })
}

export function coverageText(result: CheckResult): string[] {
  const coverage = result.result.coverage
  if (coverage.length === 0) return []
  const summary = roomsSummary(result)
  const several = new Set(coverage.flatMap((check) => [...check.lookedAt, ...check.skipped].map((group) => group.floor))).size > 1
  const lines = ['', t('report.lookedAtByOne', { summary }), t('report.eachCheck', { count: coverage.length })]
  for (const check of coverage) {
    if (check.lookedAtCount === 0) lines.push(`  - ${nothingCheckedText(checkTitle(check), check.looksAt)}${readForText(check)}.`)
    else lines.push(`  - ${t('report.checkLookedAt', { title: checkTitle(check), parts: partsText(check.lookedAtCount, check.looksAt), findings: findingsText(check.findings), readFor: readForText(check) })}`)
    if (check.lookedAtCount > 0 && check.lookedAtCount <= 8) lines.push(`      ${t('report.lookedAtIds', { ids: idsText(check.lookedAt.flatMap((group) => group.ids)) })}`)
    for (const skip of check.skipped) {
      const where = several && skip.floor !== '' ? t('report.on', { floor: name(skip.floor) }) : ''
      lines.push(`      ${t('report.notLookedAt', { parts: partsText(skip.ids.length, check.looksAt), where, why: whyText(skip), ids: idsText(skip.ids) })}`)
    }
  }
  return lines
}

/**
 * MSG-10: what each check looked at, in counts: the rooms looked at by at least one check (and
 * those none did), then each check's count, the parts it could not look at with the reason,
 * its findings when it gave any, and the kind of building its figures were read for (COD-2).
 * A part a check is not about (`use_not_covered`) is no gap and is left to the full report.
 */
export function coverageSummary(result: CheckResult): string[] {
  // BRF-3: the check of the building against its plot, on a plan that states no plot, looked at
  // nothing and could not have: the short report leaves it to the full one.
  const coverage = result.result.coverage.filter((check) => !(check.looksAt === 'edge' && check.lookedAtCount === 0 && check.skipped.length === 0))
  if (coverage.length === 0) return []
  // COD-2: the kind of building, once when every check that used figures read them for the same.
  const withFigures = coverage.filter((check) => check.lookedAtCount > 0 && (check.readFor?.length ?? 0) > 0)
  const kinds = [...new Set(withFigures.map((check) => tv(buildingKindsSaid(check.readFor!))))]
  const once = kinds.length === 1
  const lines = ['', t('report.lookedAtByOne', { summary: roomsSummary(result) }), t('report.eachCheck', { count: coverage.length })]
  // COD-3: the checks that did not run because no place is stated, in one line.
  const unplaced = coverage.filter((check) => check.lookedAtCount === 0 && check.skipped.length > 0 && check.skipped.every((skip) => skip.reason === 'no_place'))
  for (const check of coverage) {
    if (unplaced.includes(check)) {
      if (check === unplaced[0]) {
        const names = unplaced.map((c, i) => subjectOf(c, i > 0))
        lines.push(t('report.notRun', { names: joined(names, 'join.comma', 'join.and'), why: whyText(check.skipped[0]!) }))
      }
      continue
    }
    const gaps = check.skipped.filter((skip) => skip.reason !== 'use_not_covered')
    const gap = gapText(gaps)
    const findings = check.findings === 0 ? '' : `; ${findingsText(check.findings)}`
    lines.push(check.lookedAtCount === 0
      ? `  - ${nothingCheckedText(checkTitle(check), check.looksAt)}${gap}.`
      : `  - ${checkTitle(check)}: ${partsText(check.lookedAtCount, check.looksAt)}${gap}${findings}${once ? '' : readForText(check)}.`)
  }
  // COD-3: when every check that used figures read them for the same kind of building, the
  // report's first line says it (`placeText`), so it is not said again here.
  return lines
}

/**
 * ARE-58: the parts a check left out, counted for each reason as worded: one reason is a total
 * beside it; several give the total, then each reason with its own count, so one part that could
 * not be drawn is never read as every part left out for another reason.
 */
function gapText(gaps: readonly { readonly ids: readonly string[]; readonly why: string; readonly said?: Said }[]): string {
  if (gaps.length === 0) return ''
  const byReason = new Map<string, number>()
  for (const skip of gaps) byReason.set(whyText(skip), (byReason.get(whyText(skip)) ?? 0) + skip.ids.length)
  const count = gaps.reduce((n, skip) => n + skip.ids.length, 0)
  if (byReason.size === 1) return t('report.gap', { count, whys: [...byReason.keys()][0]! })
  const each = [...byReason].map(([why, n]) => t('report.gap.reason', { count: n, why })).join('; ')
  return t('report.gap.byReason', { count, whys: each })
}

/** What a figure check is called in one word or two: `Room sizes`; any other check by its title. */
function subjectOf(check: CheckCoverage, inner: boolean): string {
  const subject = Object.hasOwn(FIGURE_CHECK_SUBJECTS, check.ruleId) ? FIGURE_CHECK_SUBJECTS[check.ruleId as keyof typeof FIGURE_CHECK_SUBJECTS] : null
  if (subject === null) return inner ? checkTitle(check).toLowerCase() : checkTitle(check)
  const key = subject === 'Room sizes' ? 'sizes' : 'escapes'
  return t(inner ? `check.subject.${key}.inner` : `check.subject.${key}`)
}

/** "6 of 6 rooms", with the rooms no check looked at. */
function roomsSummary(result: CheckResult): string {
  const { rooms } = result
  return rooms.rooms === 0
    ? t('report.rooms.none')
    : t('report.rooms', { lookedAt: rooms.lookedAt, rooms: partsText(rooms.rooms, 'room'), byNone: rooms.byNone.length > 0 ? t('report.rooms.byNone', { ids: idsText(rooms.byNone.map((r) => r.id)) }) : '' })
}

/**
 * The whole check as JSON; with `marked`, what `--seen` or `--unseen` did (MSG-10). `seen` is
 * there once the plan has marks, or a marks file that can't be read: a plan no one has marked
 * gives the same JSON as before.
 */
export function checkJson(result: CheckResult, marked?: MarkDone): string {
  const { seen, ...rest } = result
  const marks = seen !== undefined && (seen.problem !== null || seen.states.some((s) => s.state !== 'new') || marked !== undefined)
  const whole = { ...rest, ...(marks ? { seen } : {}), ...(marked === undefined ? {} : { marked }) }
  return `${JSON.stringify(whole, null, 2)}\n`
}
