/**
 * `grid describe <plan>`: a short account of the plan in a person's terms, so an agent can
 * check its own work without reading the file. See `describe/card.ts` for what each length
 * holds and how the person's form differs from the agent's.
 *
 * `--as rooms` (WRT-2) reads the plan back as rooms text instead: the way an agent writes a
 * plan, to change and write again with `grid write`, losing nothing.
 *
 * `--length walk` (VEW-9) is the long form: the plan walked room by room, standing in each
 * doorway (`describe/walk.ts`), one floor with `--floor`, and with `--pictures <folder>` a
 * picture at eye height from each doorway, written there.
 *
 * `--lang` (MSG-11) writes the person's form in a language, with its decimal mark unless the
 * plan's display states one. Names from the plan stay as written. The agent's form is a format
 * of codes and ids that stays as it is; only its label is in the language.
 */
import { isOwnItemKind, itemKinds, itemKindWord, type ItemGroup } from '@ongrid/floorplan/geometry'
import { DEFAULT_LANGUAGE, joined, said, say, type Language, type MessageKey } from '@ongrid/floorplan/messages'
import { ownParts, planRevision, readRoomsText, withPlainIds } from '@ongrid/floorplan/rooms'
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS, describeText, type DescribeAudience, type DescribeLength, type Words } from '../describe/card'
import { planFacts } from '../describe/facts'
import { personFacing } from '../describe/facing'
import { personSite, placeLines } from '../describe/site'
import { facingDescription } from '../quantities/facing'
import { fixtureCountText, planFixtures, type Fixtures } from '../quantities/fixtures'
import { siteDescription } from '../quantities/site'
import { askedLanguage, LANG_OPTION } from './language'
import { planWalk, walkText, type PlanWalk, type WalkStop } from '../describe/walk'
import { surveyPlan, type Survey } from '../quantities/survey'
import type { LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const DESCRIBE_OPTIONS: OptionSpecs = {
  '--length': {
    takesValue: true,
    help: 'line (one line), rooms (each room, its openings and neighbours), walls (the rooms, then every wall and its openings) or walk (the plan walked room by room from its way in: in each doorway, what is ahead, left, right and in the wall you stand in). rooms when left out.',
  },
  '--floor': {
    takesValue: true,
    help: 'With --length walk: walk only this floor (a floor id from the plan). Every floor when left out, a floor laid out like an earlier one said once.',
  },
  '--pictures': {
    takesValue: true,
    help: 'With --length walk: a folder to write a picture into from each doorway, at eye height, looking ahead: walk-01.png, walk-02.png and on. The folder must be there.',
  },
  '--for': {
    takesValue: true,
    help: 'person (names only, never an id) or agent (terse, with every id, to edit the plan from). person when left out.',
  },
  '--as': {
    takesValue: true,
    help: 'rooms: the plan as rooms text, to change and write again with grid write. It takes no --length or --for.',
  },
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}

export interface DescribeRequest {
  readonly length?: string | undefined
  readonly for?: string | undefined
  readonly as?: string | undefined
  readonly floor?: string | undefined
  readonly pictures?: string | undefined
  /** `--lang`: the language asked for, resolved with the plan's by `languageFor` once it is read. */
  readonly lang?: string | undefined
}

export interface DescribeOptions {
  /** MSG-11: the language to write in, its messages loaded (`languageFor`). English when left out. */
  readonly language?: Language | undefined
}

function oneOf<T extends string>(option: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  const names = allowed.map((name) => name).join(', ')
  throw new UsageError(`${option} takes one of ${names}: got ${JSON.stringify(value)}.`)
}

/** The length and audience asked for, checked before the plan is read. */
export function checkDescribeRequest(request: DescribeRequest): { length: DescribeLength; audience: DescribeAudience; as: 'words' | 'rooms'; language: Language | undefined } {
  const as = oneOf('--as', request.as, ['rooms'] as const, 'rooms')
  if (request.as !== undefined && (request.length !== undefined || request.for !== undefined)) {
    throw new UsageError(`--as ${as} reads the plan back as rooms text, which has no ${request.length !== undefined ? '--length' : '--for'}: leave it out.`)
  }
  const length = oneOf('--length', request.length, DESCRIBE_LENGTHS, 'rooms')
  for (const [option, value] of [['--floor', request.floor], ['--pictures', request.pictures]] as const) {
    if (value !== undefined && length !== 'walk') throw new UsageError(`${option} goes with --length walk only: ${request.as !== undefined ? '--as rooms reads back the whole plan' : `--length ${length} describes every floor and draws nothing`}.`)
  }
  return {
    length,
    audience: oneOf('--for', request.for, DESCRIBE_AUDIENCES, 'person'),
    as: request.as === undefined ? 'words' : as,
    language: askedLanguage(request.lang),
  }
}

/**
 * The plan as rooms text, losing nothing: what `grid write` writes back as it is. Its first line
 * is the label as a comment (MSG-3), which writing it back ignores.
 */
export function describeRooms(loaded: LoadedPlan, options: DescribeOptions = {}): string {
  // LVL-8: the openings the file states, not the ones its patterns place: `grid write` keeps the
  // patterns as the file has them, so their openings written here would be placed twice.
  const plan = loaded.stated ?? loaded.plan
  const patterns = plan.patterns?.length ?? 0
  const language = options.language ?? DEFAULT_LANGUAGE
  const kept = patterns === 0 ? '' : `# ${say(language, patterns === 1 ? 'describe.rooms.patterns.one' : 'describe.rooms.patterns.many', { count: patterns })}\n`
  // CMD-24: ids with no plain form (written before ids were plain) are read back plain, names as
  // written, and the text stays based on the plan as the file holds it, so it writes back over it.
  // WRT-75: a fit-out is read back from its own parts, on its base.
  const base = loaded.base
  const plain = withPlainIds(base === undefined ? plan : ownParts(plan, base))
  const read = readRoomsText(plain.plan, { ...(plan.name === undefined ? {} : { name: plan.name }), ...(base === undefined ? {} : { base: { file: base.file, plan: base.plan } }) }).text
  if (plain.renamed.length === 0) return `# ${say(language, 'label')}\n${kept}${read}`
  const list = joined(plain.renamed.map(([written, id]) => said('rooms.idFolded.id', { written, id })), 'join.comma', 'join.and')
  const based = read.replace(`based on ${planRevision(plain.plan)}`, `based on ${planRevision(base === undefined ? plan : ownParts(plan, base))}`)
  return `# ${say(language, 'label')}\n${kept}# ${say(language, 'describe.rooms.plainIds', { list })}\n${based}`
}

/** The description, in the language of `options` (MSG-11; English when left out), ending in a new line. */
export function describePlan(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience, options: DescribeOptions = {}): string {
  const w: Words = { language: options.language ?? DEFAULT_LANGUAGE, options: { decimal: loaded.plan.display?.decimal } }
  // MSG-3: the label is the first line of every description, the one-line one too.
  if (length === 'walk') {
    const { survey, walk } = walkOf(loaded)
    return describeWalk(survey, walk, audience, new Map(), options)
  }
  return `${say(w.language, 'label')}\n${describeBody(loaded, length, audience, w)}`
}

/** VEW-9: the plan surveyed and walked, every floor or the one given (an id already checked). */
export function walkOf(loaded: LoadedPlan, floor?: string): { survey: Survey; walk: PlanWalk } {
  const survey = surveyPlan(loaded.plan)
  return { survey, walk: planWalk(survey, floor) }
}

/** VEW-9: the walk in words, after the label, naming each stop's picture when it has one; in the language of `options` (MSG-11). */
export function describeWalk(survey: Survey, walk: PlanWalk, audience: DescribeAudience, pictures: ReadonlyMap<WalkStop, string> = new Map(), options: DescribeOptions = {}): string {
  const w: Words = { language: options.language ?? DEFAULT_LANGUAGE, options: { decimal: survey.plan.display?.decimal } }
  return `${say(w.language, 'label')}\n${walkText(survey, walk, audience, pictures, w)}`
}

/**
 * The fixtures counted, in the person's words: `1 toilet, 2 basins`; CNT-20: then the furniture,
 * `Furniture: 1 bed, 2 tables`, when there is any. A kind added through the registry is counted by
 * its own word.
 */
function personFixtures(counts: Fixtures['counts'], w: Words): string {
  const listOf = (group: ItemGroup): string[] =>
    itemKinds(group)
      .filter((kind) => (counts[kind] ?? 0) > 0)
      .map((kind) =>
        isOwnItemKind(kind)
          ? say(w.language, `describe.fixture.${kind}.${counts[kind] === 1 ? 'one' : 'many'}` as MessageKey, { count: counts[kind]! }, w.options)
          : say(w.language, 'describe.fixture.other', { count: counts[kind]!, word: itemKindWord(kind) }, w.options)
      )
  const comma = say(w.language, 'join.comma')
  const fixed = listOf('fixture')
  const furniture = listOf('furniture')
  return [
    ...(fixed.length > 0 || furniture.length === 0 ? [say(w.language, 'describe.fixtures', { list: fixed.join(comma) }, w.options)] : []),
    ...(furniture.length === 0 ? [] : [say(w.language, 'describe.furniture', { list: furniture.join(comma) }, w.options)]),
  ].join(' ')
}

function describeBody(loaded: LoadedPlan, length: DescribeLength, audience: DescribeAudience, w: Words): string {
  const described = describeText(planFacts(loaded.plan), length, audience, w)
  // CNT-3: north, the ways the rooms face and the front, on the longer descriptions of a plan
  // that states any of them.
  // BRF-3: and the plot, its coverage and the edge the building comes nearest. CNT-50: the
  // site's name and address first.
  const facing =
    length === 'line' ? [] : audience === 'person' ? [...placeLines(loaded.plan, audience, w), ...personFacing(loaded.plan, w), ...personSite(loaded.plan, w)] : [...placeLines(loaded.plan, audience, w), ...facingDescription(loaded.plan, audience), ...siteDescription(loaded.plan, audience)]
  // They go before the closing line, which says the description checks nothing.
  const close = described.lastIndexOf('\n', described.length - 2) + 1
  const gap = audience === 'person' ? '\n' : ''
  const text = facing.length === 0 ? described : `${described.slice(0, close)}${facing.join('\n')}\n${gap}${described.slice(close)}`
  // CNT-12: the fixtures, counted, on the longer descriptions of a plan that has some.
  if (length === 'line' || (loaded.plan.items ?? []).length === 0) return text
  const fixtures = planFixtures(loaded.plan)
  if (fixtures.rows.length === 0) return text
  if (audience === 'person') return `${text}${personFixtures(fixtures.counts, w)}\n`
  const named = fixtures.rows.some((row) => row.group === 'furniture') ? 'Fixtures and furniture' : 'Fixtures'
  return `${text}${named}: ${fixtureCountText(fixtures.counts)}. grid_schedule lists each with its room and size.\n`
}
