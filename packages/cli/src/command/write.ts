/**
 * `grid write <plan.rooms>` (WRT-2): writes a plan from rooms text. The agent names the rooms
 * with their sizes and neighbours, and the doors and windows by the rooms they join; Grid works
 * out the walls, their kinds, each room's boundary and each opening's place, and writes them
 * into the plan file.
 *
 * The plan file is the source of truth, and its walls stay in it and stay editable; rooms text
 * is a way of writing it, and `grid describe --as rooms` reads any plan back as rooms text. So
 * writing never loses a change made to the plan some other way: rooms text read from an
 * earlier version of the plan (its `based on` line), or written over a plan that was changed
 * since Grid last wrote it from rooms text, is refused with the difference, and nothing is
 * written. `--replace` writes over it anyway.
 *
 * The tool server's `grid_write_rooms` does the same through `writeRoomsIntoProject`.
 */
import { doorsThatChangedRooms, expandPatterns, floorOf, floorsWithNoStair, indexPlan, itemKindWord, itemRoom, mergeBase, planFloors, roomShapes, validatePlan, type FloorPlan, type TapedRow } from '@ongrid/floorplan/geometry'
import { english, name, said, type Said } from '@ongrid/floorplan/messages'
import { baseNamedIn, carryFacts, compileRoomsText, ownParts, planRevision, problemLines, roomsAnswer, stampFor, writtenSite, type BasePlan, type RoomsResult } from '@ongrid/floorplan/rooms'
import { FloorPlanSchema, safeParseFloorPlan, statedOpening, statedWall } from '@ongrid/floorplan/types/floorplan'
import { inspectPlan } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { briefAnswer, briefReminder, type BriefData } from '../brief/answer'
import { TAPED_ROWS_IN_AN_EDIT, tapedRows, tapedTable } from '../taped/table'
import { TextNotDecoded } from '../fs/textEncoding'
import { occupancyFileOf } from '../occupancy/occupancy'
import { comparePlans } from '../quantities/compare'
import { surveyPlan } from '../quantities/survey'
import { siteDescription } from '../quantities/site'
import starterPlan from './starter-plan.json'
import { loadBase, loadPlan, PlanRefused } from './plan'
import { refuseGridFile } from './planFile'
import { nameNotes, PLAN_FILE_MAX_BYTES, planTextProblem } from './planText'
import { PROJECT_OPTION, type OptionSpecs } from './options'
import { droppedWords, floorsDropped, type DroppedFloor } from './writeLoss'

export const WRITE_OPTIONS: OptionSpecs = {
  '--plan': {
    takesValue: true,
    help: 'The plan file to write, ending in .json. In a project folder, its plan.json when left out.',
  },
  '--replace': {
    takesValue: false,
    help: 'Write over a plan that was not written from this rooms text or scan, or was changed since. Grid refuses that otherwise, with the difference.',
  },
  '--scan': {
    takesValue: true,
    help: 'Write the plan from a phone room scan in the project (Apple\'s room model, as JSON) in place of rooms text. The scan is kept beside the plan as <plan>.scan.json.',
  },
  '--layout': {
    takesValue: true,
    help: 'In place of a rooms file: a first layout from the brief beside the plan. tidy: a rectangle; sizes: every size kept.',
  },
  '--json': { takesValue: false, help: 'Print the answer as JSON.' },
  ...PROJECT_OPTION,
}

/** Why rooms text was not written: its problems, or a plan that would lose a change. The message is one line. */
export class RoomsRefused extends Error {
  override readonly name = 'RoomsRefused'
  constructor(
    readonly code: string,
    message: string,
    readonly problems: readonly string[] = []
  ) {
    super(message)
  }
}

export interface WriteDone {
  readonly written: string
  readonly result: RoomsResult
  readonly plan: FloorPlan
  /** The comparison with the plan before, or null when there was none. */
  readonly verdict: string | null
  readonly drawingProblems: { readonly before: number; readonly after: number }
  /** WRT-57: what grid check lists (the record's count, routes out and all), before and after. */
  readonly toLookAt: { readonly before: number; readonly after: number }
  /** WRT-57: each door that joins other rooms than it did before, one that no longer leads outside first. */
  readonly doors: readonly string[]
  /** BRF-1: the brief beside the plan, line by line against the plan written. */
  readonly brief: BriefData
  /** BRF-1: one line when this is the plan's first write and no brief is kept beside it; never a refusal. */
  readonly reminder: string | null
  /** HND-11: each length taped on site the file keeps, against the plan written. */
  readonly taped: readonly TapedRow[]
  /** WRT-46: the fixtures and furniture the file keeps, which rooms text does not write, where they stand now. */
  readonly itemsKept: readonly KeptItem[]
  readonly lines: readonly string[]
}

/** WRT-46: an item a rewrite kept: where it stands, the room it is in now, and what the checks say of it there. */
export interface KeptItem {
  readonly id: string
  readonly kind: string
  readonly at: readonly [number, number]
  readonly floor: string
  /** The room it stands in now, by name (its id when it has none), or null for none. */
  readonly room: string | null
  /** The checks' sentences on it that the new walls may cause: a wall it runs into, standing in no room. */
  readonly worthALook: readonly string[]
}

/** The item checks a rewrite's walls can bring about. */
const KEPT_ITEM_CODES = new Set(['item/into-wall', 'item/outside-rooms'])
/** Kept items named in the answer, and their "worth a look" lines, at most. */
const ITEMS_LISTED_MAX = 10
const ITEM_LOOKS_MAX = 5

/** WRT-46: the items the plan as written keeps, with their rooms and the checks on them. */
function keptItems(plan: FloorPlan): { readonly items: KeptItem[]; readonly problems: number } {
  const items = plan.items ?? []
  const index = indexPlan(plan)
  const { issues, broken } = validatePlan(plan, index)
  if (items.length === 0) return { items: [], problems: issues.length }
  const rooms = roomShapes(index, broken)
  const looks = new Map<string, string[]>()
  for (const issue of issues) if (KEPT_ITEM_CODES.has(issue.code)) looks.set(issue.id, [...(looks.get(issue.id) ?? []), issue.message])
  const kept = items.map((item): KeptItem => {
    const room = itemRoom(item, rooms)
    return { id: item.id, kind: item.kind, at: [item.at[0], item.at[1]], floor: floorOf(item), room: room === null ? null : room.name || room.id, worthALook: looks.get(item.id) ?? [] }
  })
  return { items: kept, problems: issues.length }
}

/** WRT-46: the lines on the items kept: how many and which, then each one the new walls put in the way. */
function keptItemLines(items: readonly KeptItem[]): string[] {
  if (items.length === 0) return []
  const one = (item: KeptItem): Said =>
    item.room === null ? said('write.items.item.noRoom', { kind: itemKindWord(item.kind), id: name(item.id) }) : said('write.items.item.room', { kind: itemKindWord(item.kind), id: name(item.id), room: name(item.room) })
  const listed = items.slice(0, ITEMS_LISTED_MAX).map((item) => english(one(item)))
  const more = items.length > ITEMS_LISTED_MAX ? said('write.items.more', { n: items.length - ITEMS_LISTED_MAX }) : ''
  const head = items.length === 1 ? said('write.items.kept.one', { items: listed[0]! }) : said('write.items.kept.many', { n: items.length, items: listed.join('; '), more })
  const looks = items.flatMap((item) => item.worthALook)
  return [
    english(head),
    ...looks.slice(0, ITEM_LOOKS_MAX).map((message) => english(said('write.items.look', { message }))),
    ...(looks.length > ITEM_LOOKS_MAX ? [english(said('write.items.looksMore', { n: looks.length - ITEM_LOOKS_MAX }))] : []),
  ]
}

/**
 * WRT-4 with LVL-8: one line on the opening patterns `grid write` keeps: how many, and the first
 * thing the walls just written keep a pattern from placing that the plan before did not.
 */
function patternsKept(before: FloorPlan, after: FloorPlan): string {
  const n = after.patterns?.length ?? 0
  const known = new Set(expandPatterns(before).issues.map((issue) => issue.message))
  const fresh = expandPatterns(after).issues.filter((issue) => !known.has(issue.message))
  const kept = `Kept the plan's ${n === 1 ? 'opening pattern' : `${n} opening patterns`} as the file has ${n === 1 ? 'it' : 'them'}: rooms text does not write ${n === 1 ? 'it' : 'them'}.`
  if (fresh.length === 0) return kept
  return `${kept} With the walls written now: ${fresh[0]!.message}${fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : ''}.`
}

/**
 * LVL-14: a floor above the ground that nothing joins to the ground floor, said at once, with the
 * rooms-text line that adds a stair. The check names it too (`floor/no-stair`).
 */
function noStairLines(plan: FloorPlan): string[] {
  const names = new Map(planFloors(plan).map((f) => [f.id, f.name || f.id] as const))
  return floorsWithNoStair(plan).map(({ floor, from }) => english(said('check.noStair.write', { floor: name(names.get(floor) ?? floor), floorId: floor, belowId: from })))
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const STARTER_REVISION = planRevision(FloorPlanSchema.parse(starterPlan))

/** A plan that holds nothing yet, or is still the starter plan `grid init` wrote. */
export function nothingToLose(plan: FloorPlan): boolean {
  if (plan.walls.length + plan.rooms.length + plan.openings.length === 0) return true
  return planRevision(plan) === STARTER_REVISION
}

/** Reads rooms text from a file in the project. */
export function readRoomsFile(project: Project, file: string): string {
  try {
    return project.readText(file, PLAN_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof TextNotDecoded) throw new PlanRefused(oneLine(error.message))
    if (!(error as NodeJS.ErrnoException).code) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${file}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${file} is a folder, not rooms text.`)
    if (code === 'EFBIG') throw new PlanRefused(`${file} is larger than ${PLAN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads.`)
    throw new PlanRefused(`${file} can't be read: ${oneLine((error as Error).message)}`)
  }
}

/** CMD-30: a plan the person made read-only is refused before anything is worked out, and left as it is. */
export function refuseReadOnly(project: Project, planFile: string): void {
  try {
    project.writable(planFile)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'EPERM') return
    throw new RoomsRefused('rooms/plan-file', `${project.shown(project.resolve(planFile))} was not written: ${oneLine((error as Error).message)}.`)
  }
}

/** What writing would change, in a sentence, for a refusal. */
export function differenceLine(before: FloorPlan, after: FloorPlan): string {
  return comparePlans(surveyPlan(before), surveyPlan(after), ['the plan now', 'the plan this text writes']).verdict
}

/**
 * Writes rooms text into the plan file `planFile`. Refuses with `RoomsRefused` (the text's
 * problems, or a plan that would lose a change), `PlanRefused` (a plan file that is there but
 * is not a plan) or the project's `PathRefused`; nothing is written then.
 */
/** Rooms past which the tool's answer lists only what is not plain: sizes to the walls, guesses, warnings. */
export const ROOMS_LISTED_MAX = 12

/**
 * WRT-75: the base plan the text's `base` line names, read from the project by the rules a plan's
 * base is read by (`loadBase`); null when it names none. The plan itself is never its own base.
 */
function baseOfText(project: Project, text: string, planFile: string): BasePlan | null {
  const named = baseNamedIn(text)
  if (named === null) return null
  const shown = project.shown(project.resolve(planFile))
  let same = false
  try {
    same = project.resolve(named.file, 'project') === project.resolve(planFile)
  } catch {
    // A path the project refuses is refused by loadBase, in its words.
  }
  if (same) throw new RoomsRefused('rooms/base', english(said('write.base.self', { file: name(named.file) })))
  try {
    return { file: named.file, plan: loadBase(project, named.file, shown).plan }
  } catch (error) {
    if (!(error instanceof PlanRefused)) throw error
    throw new RoomsRefused('rooms/base', english(said('write.base.refused', { why: oneLine(error.message) })))
  }
}

export function writeRoomsIntoProject(project: Project, text: string, planFile: string, options: { readonly replace?: boolean; readonly brief?: boolean } = {}): WriteDone {
  if (!planFile.toLowerCase().endsWith('.json')) throw new RoomsRefused('rooms/plan-file', `The plan to write must be a .json file: got ${JSON.stringify(planFile)}.`)
  // WRT-13: grid.json and the files kept beside a plan are never written as a plan.
  refuseGridFile(project.shown(project.resolve(planFile)), planFile)
  refuseReadOnly(project, planFile)
  // WRT-75: a fit-out's base is read before the text is written, and its rooms rest on its walls.
  const base = baseOfText(project, text.normalize('NFC'), planFile)
  const withShell = (plan: FloorPlan): FloorPlan => (base === null ? plan : mergeBase(plan, base.plan).plan)
  // CMD-30: names in one form (NFC), so a letter typed with a combining accent is the one the plan holds.
  const result = compileRoomsText(text.normalize('NFC'), base === null ? {} : { base })
  if (result.plan === null) {
    const lines = problemLines(result)
    const more = lines.length > 1 ? ` (${lines.length - 1} more: ${lines.slice(1).join(' | ')})` : ''
    throw new RoomsRefused(result.problems[0]?.code ?? 'rooms/syntax', `The rooms text was not written, and the plan is as it was: ${lines[0] ?? 'it could not be read'}${more}`, lines)
  }
  // The text's names and ids are held to the plan file's own limits (MSG-9).
  const problem = planTextProblem(result.plan as unknown as Record<string, unknown>)
  if (problem !== null) throw new RoomsRefused('rooms/text-limit', `The rooms text was not written: ${problem}.`)
  const parsed = FloorPlanSchema.safeParse(result.plan)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new RoomsRefused('rooms/schema', `The rooms text was not written: the plan it makes does not fit the plan's format at ${first?.path.join('.') ?? 'its top'} (${first?.message ?? 'invalid'}).`)
  }
  let plan = parsed.data
  // WRT-16: a text with no rooms would write an empty plan, whatever --replace says.
  if (plan.rooms.length === 0) {
    throw new RoomsRefused('rooms/empty', 'The rooms text was not written, and the plan is as it was: it has no rooms, so it would write an empty plan. Add the rooms (room <id> "<name>" <use> <width> x <depth> ...), or read the plan back as rooms text (grid describe --as rooms) and change that.')
  }

  // The plan now, if there is one, and whether writing over it would lose a change.
  let before: FloorPlan | null = null
  // WRT-75: the plan's own parts, without its base's: what the file holds and was stamped from.
  let own: FloorPlan | null = null
  let beforeBase: FloorPlan | undefined
  let dropped: DroppedFloor[] = []
  let raw: Record<string, unknown> = { version: '1', units: 'm' }
  // The plan as a person sees its name: relative to the folder Grid runs in.
  const shownFile = project.shown(project.resolve(planFile))
  if (project.exists(planFile)) {
    // Read whole: the plan is written over, and a part the reader left out would be lost unseen.
    const loaded = loadPlan(project, planFile, { whole: true })
    before = loaded.plan
    own = loaded.base === undefined ? before : ownParts(before, loaded.base)
    beforeBase = loaded.base?.plan
    // CNT-10: rooms text holds no phase, so writing it over a plan with phases would lose them.
    // WRT-75: it holds a base, so a fit-out is written again on the same base.
    if (options.replace !== true && [...own.walls, ...own.openings, ...own.rooms].some((part) => part.phase !== undefined)) {
      throw new RoomsRefused(
        'rooms/phases',
        `${shownFile} holds existing, demolished and new parts, which rooms text does not hold, so writing it from rooms text would lose them. Change it with the edit tools (grid edit), which keep each part's phase and leave a base as it is; or add --replace to write over it and lose them.`
      )
    }
    if (options.replace !== true && before.base !== undefined && plan.base !== before.base) {
      const words = { file: name(shownFile), was: name(before.base), now: name(plan.base ?? '') }
      throw new RoomsRefused('rooms/phases', english(said(plan.base === undefined ? 'write.base.dropped' : 'write.base.changed', words)))
    }
    raw = JSON.parse(project.readText(planFile, PLAN_FILE_MAX_BYTES).text) as Record<string, unknown>
    // WRT-16: rooms text for some floors would take the others, with their rooms, outlines, homes and parking.
    dropped = floorsDropped(before, withShell(plan))
    if (options.replace !== true && dropped.length > 0) {
      const shown = dropped.slice(0, 10).map(droppedWords).join('; ')
      throw new RoomsRefused(
        'rooms/floors-dropped',
        `${shownFile} has ${dropped.length === 1 ? 'a floor' : `${dropped.length} floors`} this rooms text does not mention, and writing it would drop ${dropped.length === 1 ? 'it' : 'them'}: ${shown}${dropped.length > 10 ? ` and ${dropped.length - 10} more` : ''}. Nothing was written. Read the whole plan back as rooms text (grid describe --as rooms), change that and write it, which keeps every floor; or add --replace to drop ${dropped.length === 1 ? 'it' : 'them'}.`
      )
    }
    const now = planRevision(own)
    if (options.replace !== true) {
      if (result.basedOn !== null && result.basedOn !== now) {
        throw new RoomsRefused(
          'rooms/stale',
          `This rooms text was read from another version of ${shownFile} (based on ${result.basedOn}; the plan is now ${now}), so writing it would undo what changed since. ${differenceLine(before, withShell(plan))} Read the plan back again (grid describe --as rooms), make the change there and write that; or add --replace to write over it.`
        )
      }
      const unchanged = before.written !== undefined && before.written.revision === now
      if (result.basedOn === null && !unchanged && !nothingToLose(own)) {
        const why = before.written === undefined ? 'was not written from rooms text' : 'was changed since Grid last wrote it from rooms text'
        throw new RoomsRefused(
          'rooms/plan-changed',
          `${shownFile} ${why}, and writing this text over it would lose that. ${differenceLine(before, withShell(plan))} Read the plan back as rooms text (grid describe --as rooms), which keeps it, and change that; or add --replace to write over it.`
        )
      }
    }
  }

  // CNT-9: the facts of the person's own and the rooms' numbers stay with their parts, by id.
  const carried = own === null ? null : carryFacts(own, plan)
  if (carried !== null) plan = carried.plan
  // Everything the rooms text does not hold stays as the file has it: its id, its picture.
  const next: Record<string, unknown> = { ...raw, version: '1', units: 'm' }
  delete next['floors']
  if (plan.floors !== undefined) next['floors'] = plan.floors
  // CNT-5: a `building` line sets what kind of building it is; without one, the file's stays.
  if (plan.building !== undefined) next['building'] = plan.building
  // WRT-7: a `display` line sets how the person reads lengths; without one, the file's stays.
  // MSG-24: the file's language and its own words (C32) stay too, as rooms text holds neither.
  if (plan.display !== undefined) next['display'] = { ...keptWords(raw['display']), ...plan.display }
  // WRT-6: a height the text did not state stays out of the file; the reading fills it again.
  next['walls'] = plan.walls.map(statedWall)
  next['rooms'] = plan.rooms
  // CNT-15: a value an opening's type gives stays out of the file, as a wall's does.
  next['openings'] = plan.openings.map(statedOpening)
  // CNT-4: the flats a text places (a unit that is a flat type) replace the file's; a text that
  // places none keeps the file's, as it keeps its opening patterns.
  if (plan.flats !== undefined) {
    next['flatTypes'] = plan.flatTypes ?? []
    next['flats'] = plan.flats
  }
  // CNT-41: the site lines set what they write of the plot, north and the site's things; the rest
  // of the file's site stays (`writtenSite`).
  if (plan.site !== undefined) next['site'] = writtenSite(raw['site'], plan.site)
  if (plan.north !== undefined) next['north'] = plan.north
  // LVL-21: the stair lines replace the file's stairs; a text that writes none keeps the file's.
  if (plan.stairs !== undefined) next['stairs'] = plan.stairs
  // WRT-75: the base the text names; a text with none, written over a fit-out as asked, takes it off.
  if (plan.base !== undefined) next['base'] = plan.base
  else delete next['base']
  // SHT-14: the `plan` line's name stays in the plan; without one, the file's name stays.
  if (result.name !== null && result.name !== '') next['name'] = result.name
  next['written'] = stampFor(plan)
  // BRF-1: whether this is the plan's first write, before it is written.
  const first = own === null || nothingToLose(own)
  const written = project.relative(project.writeFile(planFile, `${JSON.stringify(next, null, 2)}\n`))
  // WRT-75: a fit-out is measured, counted and checked with its base read in, as every command reads it.
  const shelled = withShell(plan)
  const brief = briefAnswer(project, planFile, shelled)
  const reminder = first ? briefReminder(project, planFile, shelled) : null
  // HND-11 (lab WR-14): the taped lengths the file keeps, against the plan as written.
  const nextPlan = withShell(safeParseFloorPlan(next) ?? plan)
  const taped = tapedRows(nextPlan)

  const verdict = before === null || own === null || nothingToLose(own) ? null : comparePlans(surveyPlan(before), surveyPlan(shelled), ['the plan before', 'the plan now']).verdict
  // WRT-4 with LVL-8: the file's opening patterns are kept and name their walls by id, so the plan
  // written is counted with them, and what the new walls keep from being placed is said here.
  const patterns = before?.patterns ?? []
  const kept: FloorPlan = patterns.length === 0 ? shelled : { ...shelled, patterns }
  // WRT-46: the plan as written, with the items, columns and other parts the file keeps, is the one
  // counted after, as the plan before was counted with them; its items are said with their rooms.
  const items = keptItems(withShell(safeParseFloorPlan(next) ?? kept))
  const drawingProblems = { before: before === null ? 0 : validatePlan(before).issues.length, after: items.problems }
  // WRT-57: what grid check will list, as an edit counts it, so a write that leaves no way out says so;
  // and the doors that now join other rooms, from where each stands.
  const toLookAt = { before: before === null ? 0 : inspectPlan(raw, beforeBase === undefined ? {} : { base: beforeBase }).count, after: inspectPlan(next, base === null ? {} : { base: base.plan }).count }
  const doors = before === null ? [] : doorLines(before, nextPlan)
  const lines = [
    `Wrote ${written} from rooms text: the walls, their kinds, the room boundaries and the openings' places are worked out by Grid.`,
    ...roomsAnswer(result, options.brief !== true || result.rooms.length <= ROOMS_LISTED_MAX),
    // CMD-30: a new name that reads as an instruction or holds a person's name, said gently.
    ...nameNotes(next, before === null ? null : raw, occupancyFileOf(written)).map(english),
    ...(verdict === null ? [] : [verdict]),
    ...(dropped.length === 0 ? [] : [`Floors dropped, as asked: ${dropped.slice(0, 10).map(droppedWords).join('; ')}${dropped.length > 10 ? ` and ${dropped.length - 10} more` : ''}.`]),
    ...(carried === null || carried.kept === 0 ? [] : [`Facts of your own and room numbers kept by id on ${carried.kept} part${carried.kept === 1 ? '' : 's'}.`]),
    ...(carried === null || carried.lost.length === 0 ? [] : [`Not in the text, so their facts and numbers are gone with them: ${carried.lost.slice(0, 10).join(', ')}${carried.lost.length > 10 ? ` and ${carried.lost.length - 10} more` : ''}.`]),
    ...(before === null || patterns.length === 0 ? [] : [patternsKept(before, kept)]),
    ...keptItemLines(items.items),
    // CNT-41: the plot in a line or two when the text wrote any of the site.
    ...(plan.site === undefined ? [] : siteDescription(nextPlan, 'agent')),
    ...(plan.stairs !== undefined || (before?.stairs ?? []).length === 0 ? [] : [`Kept the plan's ${before!.stairs!.length === 1 ? 'stair' : `${before!.stairs!.length} stairs`} as the file has ${before!.stairs!.length === 1 ? 'it' : 'them'}: this rooms text writes no stair line. grid describe --as rooms writes ${before!.stairs!.length === 1 ? 'it' : 'them'} as stair lines.`]),
    ...(plan.flats !== undefined || (before?.flats ?? []).length === 0 ? [] : [`Kept the plan's ${before!.flats!.length === 1 ? 'flat' : `${before!.flats!.length} flats`} as the file has ${before!.flats!.length === 1 ? 'it' : 'them'}: this rooms text places no flat type. grid check names a room a flat lists that the text no longer has.`]),
    ...doors,
    english(said('write.toLookAt', { before: toLookAt.before, after: toLookAt.after, drawingBefore: drawingProblems.before, drawingAfter: drawingProblems.after })),
    ...noStairLines(shelled),
    ...brief.text,
    ...(reminder === null ? [] : [reminder]),
    ...tapedTable(taped, { max: TAPED_ROWS_IN_AN_EDIT }),
  ]
  return { written, result, plan, verdict, drawingProblems, toLookAt, doors, brief: brief.data, reminder, taped, itemsKept: items.items, lines }
}

/** WRT-57: the doors that join other rooms than before (MSG-14), those that no longer lead outside first and said so. */
function doorLines(before: FloorPlan, after: FloorPlan): string[] {
  const out = (sides: readonly object[]): boolean => sides.some((side) => 'outside' in side)
  const changes = doorsThatChangedRooms(before, after)
  const lost = changes.filter((change) => out(change.before) && !out(change.after))
  return [...lost.map((change) => english(said('write.door.notOut', { change: change.message }))), ...changes.filter((change) => !lost.includes(change)).map((change) => `${change.message}.`)]
}

/** MSG-24: the language and the words (C32) of the file's display, which rooms text does not hold. */
function keptWords(display: unknown): Record<string, unknown> {
  if (typeof display !== 'object' || display === null || Array.isArray(display)) return {}
  const own = display as Record<string, unknown>
  return { ...(own['language'] === undefined ? {} : { language: own['language'] }), ...(own['words'] === undefined ? {} : { words: own['words'] }) }
}
