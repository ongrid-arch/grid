/**
 * What every tool of `grid serve` shares: how a tool is written down, how its arguments are
 * read, and how it finds the plan, the floor and the room it was asked about.
 *
 * One description of each argument gives both the input schema `tools/list` shows and the
 * check a call goes through, so the two cannot drift apart. A refusal names the argument and
 * what it takes. It never repeats the value it was sent: that is text from the agent, and may
 * be anything (MS-19, T-3).
 */
import { LANGUAGES, say } from '@ongrid/floorplan/messages'
import { GENERAL_GUIDANCE_LABEL, planFloors, type FloorPlan } from '@ongrid/floorplan/geometry'
import { floorAsked } from '@ongrid/floorplan/geometry/floorAsked'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { ID_PATTERN as PLAIN_ID_PATTERN, plainId, readPlainId, ROOM_USES, readUse } from '@ongrid/floorplan/types/floorplan'
import { likelyId, nearestIds } from '@ongrid/floorplan/types/nearest'
import { PATH_MAX, PathRefused, quoted, type Project } from '../fs/projectFiles'
import { missingDefaultPlan, projectPlanFile } from '../command/init'
import { UsageError } from '../command/options'
import { PlanRefused, type LoadedPlan, type LoadOptions } from '../command/plan'
import { cachedPlan } from './planCache'
import { ID_MAX as PLAN_ID_MAX, UNSAFE_TEXT } from '../command/planText'
import { budgetArgs, LEFT_OUT_SCHEMA } from './budget'
import { REVISION_DATA_NAME, REVISION_SCHEMA, revisionArgs } from './revisions'
import { heardPlan, languageArgs, type Spoken } from './answerLanguage'
import type { Language } from '@ongrid/floorplan/messages'

/** WRT-7: the decimal mark the call's lengths are typed with. */
export const DECIMAL_IN_ARG: ArgSpec = {
  type: 'string',
  enum: ['point', 'comma'],
  description: 'The decimal mark of the lengths typed as text in this call: point (3.81) or comma (3,81). point when left out.',
  examples: ['comma'],
}

/** MSG-22: the longest word a use argument may be, such as `cuarto de máquinas`. */
export const USE_WORD_MAX = 64

/** The longest text a length argument may be, such as 12' 6 1/2" (WRT-7). */
export const LENGTH_TEXT_MAX = 40

/** The longest id an argument may hold: a floor, room, opening or wall id, as long as a plan file may hold. */
export const ID_MAX = PLAN_ID_MAX
/**
 * What an id may hold: letters, digits, dash, underscore and dot (T-3). CMD-24: the one rule rooms
 * text writes ids by (`readPlainId` in `types/planText.ts`), so an id one takes, all take.
 */
export const ID_PATTERN = PLAIN_ID_PATTERN
const ID = new RegExp(ID_PATTERN)

/** Why a call was refused, in Grid's words. It comes back as a tool error, never a throw. */
export class ToolRefusal extends Error {
  override readonly name = 'ToolRefusal'
}

/** One argument, written once for the schema and for the check. */
export type ArgSpec =
  | {
      readonly type: 'string'
      readonly description: string
      readonly examples: readonly string[]
      readonly enum?: readonly string[]
      readonly maxLength?: number
      /** An id of the plan: letters, digits, dash, underscore and dot, at most `ID_MAX`. */
      readonly id?: boolean
      /** Text of several lines, such as rooms text: line breaks and tabs are allowed, other control characters are not. */
      readonly lines?: boolean
      /**
       * MSG-22: a room's use: one of Grid's uses, or a word that plainly means one in any language
       * the plan file reads (`readUse`): `cocina` and `Flur` are read as `kitchen` and `corridor`.
       * `enum` then lists the other words it takes as they are (`none`).
       */
      readonly use?: boolean
      readonly required?: boolean
    }
  | {
      readonly type: 'number'
      readonly description: string
      readonly examples: readonly number[]
      readonly minimum: number
      readonly maximum: number
      /**
       * WRT-7: a length. It also takes text with its unit (`"12'6\""`, `"900 mm"`), and a decimal
       * comma when the call's `decimal`, read before it, is `comma`. It is checked in metres.
       */
      readonly length?: boolean
      readonly required?: boolean
    }
  | {
      readonly type: 'boolean'
      readonly description: string
      readonly examples: readonly boolean[]
      readonly required?: boolean
    }
  | {
      readonly type: 'array'
      readonly description: string
      readonly examples: readonly (readonly string[])[]
      readonly items: { readonly id?: boolean; readonly maxLength?: number; readonly enum?: readonly string[] }
      readonly minItems: number
      readonly maxItems: number
      readonly required?: boolean
    }
  | {
      readonly type: 'object'
      readonly description: string
      /** CNT-61: a list of objects when its schema is a list. */
      readonly examples: readonly (Record<string, unknown> | readonly Record<string, unknown>[])[]
      /** The JSON Schema `tools/list` shows. */
      readonly schema: Record<string, unknown>
      /**
       * Checks the value; throws ToolRefusal with one line. `earlier` holds the arguments
       * listed before this one, already read, so a refusal they decide can come first.
       */
      readonly read: (value: unknown, earlier: Readonly<Record<string, unknown>>) => unknown
      readonly required?: boolean
    }

export type ArgSpecs = Readonly<Record<string, ArgSpec>>

/** A picture that goes back with the answer, as the MCP image content type. */
export interface AnswerImage {
  readonly data: Uint8Array
  readonly mimeType: 'image/png'
}

/** What a tool gives back: a short text for the agent, the same facts as data, maybe a picture. */
export interface Answer {
  readonly text: string
  readonly data: Record<string, unknown>
  readonly image?: AnswerImage
  /** VEW-9: more pictures, after `image`, in order: the walk-through's, one per doorway. */
  readonly images?: readonly AnswerImage[]
}

export type Hint = 'read' | 'write-file' | 'change-plan'

/** A tool as `grid serve` offers it. */
export interface GridTool {
  readonly name: `grid_${string}`
  readonly title: string
  readonly description: string
  readonly hint: Hint
  readonly args: ArgSpecs
  readonly outputSchema: Record<string, unknown>
  /**
   * VEW-4: the MCP App that shows this tool's answers, and who may call it: `model` (the agent)
   * and `app` (the page), both when left out. A host that shows no MCP App ignores it.
   */
  readonly ui?: { readonly resourceUri: string; readonly visibility?: readonly ('model' | 'app')[] }
  run(args: Record<string, unknown>, context: ToolContext): Answer | Promise<Answer>
}

/** What a tool may reach: the project folder, or the reason there is none. */
export interface ToolContext {
  readonly project: Project | PathRefused
  /** The protocol version the request named, when it named one (a 2026-07-28 client, CMD-13). */
  readonly protocolVersion?: string
  /** MSG-34: the language the call asked its answer in, read by the server; the plan's own when not given. */
  readonly language?: Language
  /** MSG-34: what the call learnt of the plan it read (its display), filled in by `readPlan`. */
  readonly spoken?: Spoken
  /** SHT-25: how far a long call has got, when the client asked (MCP's `progressToken`). */
  readonly progress?: (progress: number, total: number, message: string) => void
  /** CMD-52: every tool, the names this server lists and the groups it was started with (null for every group), for grid_help. */
  readonly tools?: { readonly all: readonly GridTool[]; readonly listed: ReadonlySet<string>; readonly groups: readonly string[] | null }
}

const HINTS: Record<Hint, Record<string, boolean>> = {
  read: { readOnlyHint: true, openWorldHint: false },
  'write-file': { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  'change-plan': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}

function argSchema(spec: ArgSpec): Record<string, unknown> {
  const rest = { ...spec }
  delete rest.required
  if (rest.type === 'string') {
    const { id, use, ...string } = rest
    delete string.lines
    // MSG-22: a use takes the person's own word, so the schema lists no closed set of words.
    if (use === true) {
      delete string.enum
      return { ...string, maxLength: USE_WORD_MAX }
    }
    return id ? { ...string, pattern: ID_PATTERN, maxLength: ID_MAX } : string
  }
  if (rest.type === 'array') {
    const { items, ...array } = rest
    const item = items.id
      ? { type: 'string', pattern: ID_PATTERN, maxLength: ID_MAX }
      : { type: 'string', ...(items.enum ? { enum: items.enum } : {}), ...(items.maxLength ? { maxLength: items.maxLength } : {}) }
    return { ...array, items: item }
  }
  if (rest.type === 'object') return { ...rest.schema, description: rest.description, examples: rest.examples }
  if (rest.type === 'number' && rest.length === true) {
    const { length: _length, ...number } = rest
    void _length
    return { ...number, type: ['number', 'string'], maxLength: LENGTH_TEXT_MAX, description: `${rest.description} A number is metres; text may give its unit, as 12'6", 900 mm or 381 cm.` }
  }
  return rest
}

/** MSG-30: the text without its first line when that line is the label, in any language Grid words it in. */
function withoutLabelLine(text: string): string {
  const [first = '', ...rest] = text.split('\n')
  return LANGUAGES.some((language) => first === say(language, 'label')) ? rest.join('\n') : text
}

/**
 * MSG-30: the tools whose answers apply no figure from a code (the plan read back, a picture, a
 * comparison, a count). Their text does not lead with the label; the instructions say once why it
 * is there, and their data still carries it.
 */
export const LABEL_SILENT_TOOLS: ReadonlySet<string> = new Set(['grid_describe', 'grid_view', 'grid_compare', 'grid_fields', 'grid_find', 'grid_count'])

/**
 * MSG-3: every answer leads with the label "General guidance, not your local rules" and carries
 * it as `label` in its data. Done here, once, so no tool can leave it out. A refusal is not an
 * answer about the plan and is left as it is.
 */
export function labelled(answer: Answer, leads = true): Answer {
  // MSG-30: an answer that applies no figure from a code carries the label in its data only.
  if (!leads) {
    const bare = withoutLabelLine(answer.text)
    const data = answer.data['text'] === answer.text ? { ...answer.data, text: bare } : answer.data
    return { ...answer, text: bare, data: { label: GENERAL_GUIDANCE_LABEL, ...data } }
  }
  // A first line that holds it already (a CSV cell, a comment in rooms text) is left as it is.
  const first = answer.text.split('\n', 1)[0]!
  const text = first.includes(GENERAL_GUIDANCE_LABEL) ? answer.text : `${GENERAL_GUIDANCE_LABEL}\n${answer.text}`
  return { ...answer, text, data: { label: GENERAL_GUIDANCE_LABEL, ...answer.data } }
}

/** The output schema with the label every answer carries (MSG-3). */
function labelledSchema(schema: Record<string, unknown>): Record<string, unknown> {
  // CMD-17: a tool whose answer differs by argument lists its variants under `anyOf`; each carries the label.
  const variants = schema['anyOf'] as readonly Record<string, unknown>[] | undefined
  const { anyOf: _variants, ...root } = schema
  void _variants
  if (variants !== undefined) return { ...labelledSchema(root), anyOf: variants.map(labelledSchema) }
  const properties = schema['properties'] as Record<string, unknown> | undefined
  if (properties === undefined) return schema
  const required = (schema['required'] as readonly string[] | undefined) ?? []
  return {
    ...schema,
    // CMD-39: an answer shortened to fit says what it left out. CMD-41: an answer about a plan, its revision.
    properties: { label: { type: 'string', const: GENERAL_GUIDANCE_LABEL }, ...properties, left_out: LEFT_OUT_SCHEMA, [REVISION_DATA_NAME]: REVISION_SCHEMA },
    required: required.includes('label') ? [...required] : ['label', ...required],
  }
}

/** The tool as `tools/list` shows it. */
export function toolDefinition(tool: GridTool): Record<string, unknown> & { name: string } {
  // CMD-39: whole, and page on a tool that only reads, beside the tool's own arguments.
  const args = allArgs(tool)
  const required = Object.entries(args).filter(([, spec]) => spec.required).map(([name]) => name)
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(args).map(([name, spec]) => [name, argSchema(spec)])),
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    outputSchema: labelledSchema(tool.outputSchema),
    annotations: { title: tool.title, ...HINTS[tool.hint] },
    // VEW-4: the MCP Apps standard's link to the page, and the older key hosts still read.
    ...(tool.ui === undefined ? {} : { _meta: { ui: { resourceUri: tool.ui.resourceUri, ...(tool.ui.visibility ? { visibility: [...tool.ui.visibility] } : {}) }, 'ui/resourceUri': tool.ui.resourceUri } }),
  }
}

/** The characters a plan file may not hold in a name either (MSG-9): one rule for both. */
const CONTROL = UNSAFE_TEXT

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function checkOne(name: string, spec: ArgSpec, value: unknown, earlier: Readonly<Record<string, unknown>> = {}): unknown {
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string' || value === '') {
        throw new ToolRefusal(spec.enum ? `${name} takes one of ${spec.enum.join(', ')}.` : `${name} takes text, for example ${quoted(spec.examples[0] ?? '')}.`)
      }
      // MSG-22: an id with accents is read in plain letters, as rooms text writes it: `baño` is `bano`.
      // CMD-30: other text in one form (NFC), so a name or a search typed with `n` and a combining
      // tilde is the same `ñ` the plan holds.
      const text = spec.id ? plainId(value) : value.normalize('NFC')
      if (spec.id) {
        if (text.length > ID_MAX) throw new ToolRefusal(`${name} is longer than ${ID_MAX} characters, the most an id may have.`)
        // CMD-24: the plan's own ids may hold letters with no plain form, written before ids were plain.
        if (readPlainId(text) === null) throw new ToolRefusal(`${name} must be an id of the plan: letters, digits, dash, underscore and dot only; a plan whose ids hold other letters gets plain ones from grid_describe as=rooms, written back with grid_write_rooms.`)
      }
      const max = spec.use === true ? USE_WORD_MAX : spec.maxLength
      if (max !== undefined && text.length > max) throw new ToolRefusal(`${name} is longer than ${max} characters.`)
      const checked = spec.lines === true ? text.replace(/\r\n|\r|\n|\t/g, ' ') : text
      if (CONTROL.test(checked)) throw new ToolRefusal(`${name} holds a control, direction or invisible character${spec.lines === true ? ' other than a line break or a tab' : ''}.`)
      if (spec.use === true) {
        if (spec.enum?.includes(text)) return text
        const use = readUse(text)
        if (typeof use === 'string' && (ROOM_USES as readonly string[]).includes(use)) {
          if (use !== text.toLowerCase()) readings.push({ word: text, use })
          return use
        }
        throw new ToolRefusal(`${name} takes one of Grid's room uses, or a word that plainly means one: ${[...ROOM_USES, ...(spec.enum ?? [])].join(', ')}.`)
      }
      if (spec.enum && !spec.enum.includes(text)) throw new ToolRefusal(`${name} takes one of ${spec.enum.join(', ')}.`)
      return text
    }
    case 'number': {
      if (spec.length === true && typeof value === 'string') {
        if (value.length > LENGTH_TEXT_MAX) throw new ToolRefusal(`${name} is longer than ${LENGTH_TEXT_MAX} characters.`)
        try {
          value = readLength(value, earlier['decimal'] === 'comma' ? 'comma' : 'point')
        } catch (error) {
          if (error instanceof LengthRefused) throw new ToolRefusal(`${name} ${error.message}.`)
          throw error
        }
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.minimum || value > spec.maximum) {
        if (spec.length === true && typeof value === 'number' && Number.isFinite(value)) throw new ToolRefusal(`${name} is ${value.toFixed(3)} m: it takes a length from ${spec.minimum} to ${spec.maximum} m.`)
        throw new ToolRefusal(`${name} takes a number from ${spec.minimum} to ${spec.maximum}.`)
      }
      return value
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new ToolRefusal(`${name} takes true or false.`)
      return value
    }
    case 'array': {
      if (!Array.isArray(value) || value.length < spec.minItems || value.length > spec.maxItems) {
        throw new ToolRefusal(`${name} takes a list of ${spec.minItems} to ${spec.maxItems} items, for example ${JSON.stringify(spec.examples[0] ?? [])}.`)
      }
      const item: ArgSpec = { type: 'string', description: '', examples: [], ...spec.items }
      return value.map((one) => checkOne(`each item of ${name}`, item, one))
    }
    case 'object': {
      // CNT-61: an argument whose schema is a list takes a list of objects, each read by `read`.
      if (spec.schema['type'] === 'array') {
        if (!Array.isArray(value)) throw new ToolRefusal(`${name} takes a list.`)
        return spec.read(value, earlier)
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal(`${name} takes an object.`)
      return spec.read(value, earlier)
    }
  }
}

/**
 * CNT-61: the JSON Schema of one entry of a list argument, from its own argument specs. `readEntry`
 * checks each entry against the same specs as a call's arguments are checked: a field it does not
 * take, one missing or a value refused is refused with `where` (such as "entry 2 of items") in front.
 */
export function entrySchema(specs: ArgSpecs): Record<string, unknown> {
  const required = Object.entries(specs).filter(([, spec]) => spec.required).map(([name]) => name)
  return { type: 'object', properties: Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, argSchema(spec)])), ...(required.length > 0 ? { required } : {}), additionalProperties: false }
}

/** CNT-61: one entry of a list argument, checked as a call's arguments are. */
export function readEntry(where: string, specs: ArgSpecs, raw: unknown, earlier: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const names = Object.keys(specs)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ToolRefusal(`${where} takes an object: ${listOf(names)}.`)
  const given = raw as Record<string, unknown>
  const unknown = Object.keys(given).filter((key) => !Object.hasOwn(specs, key))
  if (unknown.length > 0) throw new ToolRefusal(`${where} takes ${listOf(names)}, not ${unknown.length > 3 ? `${unknown.length} others` : unknown.every((key) => key.length <= ID_MAX && ID.test(key)) ? listOf(unknown.map(quoted)) : 'others'}.`)
  const entry: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(specs)) {
    const value = given[name]
    if (value === undefined || value === null) {
      if (spec.required) throw new ToolRefusal(`${where} needs ${name}: ${spec.description.split('. ')[0]!.replace(/\.$/, '')}.`)
      continue
    }
    entry[name] = checkOne(`${name} of ${where}`, spec, value, earlier)
  }
  return entry
}

/** WRT-58: the words a call gave for a use that Grid read as another word (`gym` as `sport`), by the call's arguments. */
const USES_READ = new WeakMap<object, { word: string; use: string }[]>()
let readings: { word: string; use: string }[] = []

/** WRT-58: each use word the call gave that was read as a different use, in the order given. */
export function usesRead(args: Record<string, unknown>): readonly { readonly word: string; readonly use: string }[] {
  return USES_READ.get(args) ?? []
}

/** CMD-39: the tool's own arguments and the two every answer's size is asked with; CMD-41: a change's based_on; MSG-34: the answer's language. */
export function allArgs(tool: GridTool): ArgSpecs {
  return { ...tool.args, ...budgetArgs(tool), ...revisionArgs(tool), ...languageArgs(tool) }
}

/** The arguments of a call, checked against the tool's own list. */
export function readArgs(tool: GridTool, raw: unknown): Record<string, unknown> {
  const specs = allArgs(tool)
  const names = Object.keys(specs)
  if (raw === undefined) raw = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ToolRefusal(`Pass the arguments of ${tool.name} as an object${names.length > 0 ? `: ${listOf(names)}` : ''}.`)
  }
  const given = raw as Record<string, unknown>
  // MSG-33: every fault of the call in one refusal: the arguments it does not take, each one
  // missing and each value refused, so the agent puts them all right in one more call.
  const faults: string[] = []
  const unknown = Object.keys(given).filter((key) => !Object.hasOwn(specs, key))
  if (unknown.length > 0) {
    const shown = unknown.length > 3 ? `${unknown.length} others` : unknown.every((key) => key.length <= ID_MAX && ID.test(key)) ? listOf(unknown.map(quoted)) : 'others'
    faults.push(`${tool.name} takes ${names.length > 0 ? listOf(names) : 'no arguments'}, not ${shown}.`)
  }
  const args: Record<string, unknown> = {}
  readings = []
  // The decimal mark first: a length typed with a comma is read by it (WRT-7).
  const order = Object.entries(specs).sort(([a], [b]) => (a === 'decimal' ? -1 : b === 'decimal' ? 1 : 0))
  for (const [name, spec] of order) {
    const value = given[name]
    if (value === undefined || value === null) {
      if (spec.required) faults.push(`Pass ${name}: ${spec.description.split('. ')[0]!.replace(/\.$/, '')}.`)
      continue
    }
    try {
      args[name] = checkOne(name, spec, value, args)
    } catch (error) {
      if (!(error instanceof ToolRefusal)) throw error
      faults.push(error.message)
    }
  }
  if (faults.length === 1) throw new ToolRefusal(faults[0]!)
  if (faults.length > 1) throw new ToolRefusal(faultsText(tool.name, faults))
  if (readings.length > 0) USES_READ.set(args, readings)
  return args
}

/** MSG-33: several faults of one call, as one refusal: how many, then one line each. */
export function faultsText(toolName: string, faults: readonly string[]): string {
  return [`${toolName} was not run: put these ${faults.length} right and call it again.`, ...faults.map((fault) => `- ${fault}`)].join('\n')
}

/** The project, or a refusal that says how to start the server with one. */
export function projectOf(context: ToolContext): Project {
  if (context.project instanceof PathRefused) {
    throw new ToolRefusal(`${context.project.message} For the tool server, start grid serve with --project <folder>.`)
  }
  return context.project
}

/** The plan file a call names, or the folder's own plan.json when it names none (CMD-18). */
export function planFileOf(project: Project, plan: unknown): string {
  if (typeof plan === 'string') return plan
  return projectPlanFile(project)
}

/**
 * Reads the plan a call names, turning the command's refusals into a tool's. A tool that changes
 * the plan reads it whole (MSG-6), so it never writes back a plan without a part the reader left out.
 */
export function readPlan(context: ToolContext, plan: unknown, options: LoadOptions = {}): { project: Project; file: string; loaded: LoadedPlan } {
  const project = projectOf(context)
  const file = planFileOf(project, plan)
  if (typeof plan !== 'string' && !project.exists(file)) throw new ToolRefusal(missingDefaultPlan(project, file))
  try {
    // CMD-51: the plan kept for this version, when the server read it before.
    const loaded = cachedPlan(project, file, options)
    // MSG-34: the plan's display, so the answer is in its language when the call asks none.
    heardPlan(context, loaded.plan.display)
    return { project, file, loaded }
  } catch (error) {
    throw asRefusal(error)
  }
}

/** The command's own refusals, as a tool refusal; anything else is thrown on. */
export function asRefusal(error: unknown): unknown {
  if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof UsageError) return new ToolRefusal(error.message)
  return error
}

/**
 * The floors of a plan, in level order, quoted, for a refusal: ids are text from the plan file.
 * Their names are left out: a refusal says no free text of the plan's back (MS-19).
 */
function floorList(plan: FloorPlan, only?: readonly string[]): string {
  const floors = planFloors(plan).filter((floor) => only === undefined || only.includes(floor.id))
  const shown = floors.slice(0, 20).map((floor) => quoted(floor.id))
  return `${listOf(shown)}${floors.length > 20 ? ` and ${floors.length - 20} more` : ''}`
}

/**
 * The floor a call asked for, checked against the plan. An unknown floor is refused with the
 * floors the plan has, and without the word that was sent (MS-19).
 */
/**
 * MSG-22: the plan's own id an id argument names. An id argument is read in plain letters
 * (`plainId`), so a plan whose file holds an id with accents (`baño`, written before rooms text
 * wrote ids plain) is still reached by it: the one id of the plan that reads as the one sent.
 */
export function idInPlan(ids: readonly string[], sent: unknown): string | undefined {
  if (typeof sent !== 'string') return undefined
  if (ids.includes(sent)) return sent
  const plain = ids.filter((id) => plainId(id) === sent)
  return plain.length === 1 ? plain[0] : undefined
}

export function floorArg(plan: FloorPlan, floor: unknown): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  const found = idInPlan(floors.map((f) => f.id), floor)
  if (found !== undefined) return found
  // LVL-25: a floor by its name, its level, a word of its name or an ordinal, as the person names it.
  const asked = typeof floor === 'string' ? floorAsked(plan, floor) : null
  if (asked !== null && 'id' in asked) return asked.id
  if (asked !== null) throw new ToolRefusal(say('en', 'tool.floor.among', { floors: floorList(plan, asked.among) }))
  const nearest = nearestIdText(floor, floors.map((f) => f.id))
  throw new ToolRefusal(`That floor is not in this plan.${nearest} Its floors: ${floorList(plan)}.`)
}

/**
 * The known id most likely meant by the one sent, as a sentence for a refusal (ARE-10), from
 * Grid's one nearest-id helper (MSG-7, `likelyId`); the plan's first wins a tie, and an id that
 * is not near any gives no sentence. Only the known id is quoted: the one sent is text from the
 * agent (MS-19).
 */
export function nearestIdText(sent: unknown, known: readonly string[]): string {
  if (typeof sent !== 'string') return ''
  const best = likelyId(sent, known)
  return best === null ? '' : ` The nearest known id is ${quoted(best)}.`
}

/**
 * The ids of a plan nearest the one sent, as a sentence (CMD-21): up to five, each with its note,
 * and how many more the plan holds. Never the plan's first few, which say nothing about the one
 * meant. Only known ids are quoted: the one sent is text from the agent (MS-19).
 */
export function nearestList(sent: unknown, known: readonly { id: string; note: string }[]): string {
  const ids = known.map((k) => k.id)
  const near = typeof sent === 'string' ? nearestIds(sent, ids, 5) : ids.slice(0, 5)
  const notes = new Map(known.map((k) => [k.id, k.note]))
  const shown = near.map((id) => `${quoted(id)}${notes.get(id) ?? ''}`)
  return `${shown.join(', ')}${ids.length > near.length ? ` and ${ids.length - near.length} more` : ''}`
}

/** A room the call named, checked against the plan, with the nearest ids when it is not there. */
export function roomArg(plan: FloorPlan, room: unknown, argument = 'room'): string {
  const found = idInPlan(plan.rooms.map((r) => r.id), room)
  if (found !== undefined) return found
  const nearest = nearestIdText(room, plan.rooms.map((r) => r.id))
  const list = plan.rooms.length === 0 ? 'none' : nearestList(room, plan.rooms.map((r) => ({ id: r.id, note: ` (${quoted(r.name)})` })))
  throw new ToolRefusal(`The ${argument} named is not a room of this plan.${nearest} Its nearest rooms: ${list}.`)
}

/** An opening the call named, checked against the plan, with the nearest ids when it is not there. */
export function openingArg(plan: FloorPlan, opening: unknown): string {
  const found = idInPlan(plan.openings.map((o) => o.id), opening)
  if (found !== undefined) return found
  const nearest = nearestIdText(opening, plan.openings.map((o) => o.id))
  const list = plan.openings.length === 0 ? 'none' : nearestList(opening, plan.openings.map((o) => ({ id: o.id, note: ` (${o.type})` })))
  throw new ToolRefusal(`The opening named is not in this plan.${nearest} Its nearest doors, windows and openings: ${list}.`)
}

/** A wall the call named, checked against the plan, with the nearest wall ids when it is not there. */
export function wallArg(plan: FloorPlan, wall: unknown): string {
  const ids = plan.walls.map((w) => w.id)
  const found = idInPlan(ids, wall)
  if (found !== undefined) return found
  // No single near id: the nearest walls, so the agent can choose (MSG-7, CMD-21).
  const listed = ids.length === 0 ? ' It has no walls.' : ` Its nearest walls: ${nearestList(wall, ids.map((id) => ({ id, note: '' })))}.`
  throw new ToolRefusal(`The wall named is not in this plan.${nearestIdText(wall, ids) || listed}`)
}

/** What a measure between two things may name: a wall, an opening or a room. */
export type ThingKind = 'wall' | 'opening' | 'room' | 'item'

/**
 * A wall, opening or room the call named, by id, and which of them it is. An id two kinds
 * share is read as a wall, then an opening, then a room. Unknown, it is refused with the
 * nearest id of any kind.
 */
export function thingArg(plan: FloorPlan, thing: unknown, argument: string): { kind: ThingKind; id: string } {
  const kinds: ReadonlyArray<[ThingKind, readonly string[]]> = [['wall', plan.walls.map((w) => w.id)], ['opening', plan.openings.map((o) => o.id)], ['room', plan.rooms.map((r) => r.id)], ['item', (plan.items ?? []).map((i) => i.id)]]
  for (const [kind, ids] of kinds) if (ids.includes(thing as string)) return { kind, id: thing as string }
  for (const [kind, ids] of kinds) {
    const found = idInPlan(ids, thing)
    if (found !== undefined) return { kind, id: found }
  }
  const known = [...plan.walls.map((w) => w.id), ...plan.openings.map((o) => o.id), ...plan.rooms.map((r) => r.id), ...(plan.items ?? []).map((i) => i.id)]
  throw new ToolRefusal(`What ${argument} names is no wall, door, window, opening${plan.items?.length ? ', room or fixture' : ' or room'} of this plan.${nearestIdText(thing, known) || ' The plan has none.'}`)
}

/** Every plan argument takes the same: a path inside the project. */
export const PLAN_ARG: ArgSpec = {
  type: 'string',
  description: 'The plan file, as a path inside the project folder. The project\'s own plan.json when left out, in a folder grid init made.',
  examples: ['plan.json', 'options/option-b.json'],
  maxLength: PATH_MAX,
}

/** LVL-25: a floor by its id, its name, its level or a word of its name: never held to an id's letters. */
export const FLOOR_ARG: Extract<ArgSpec, { readonly type: 'string' }> = {
  type: 'string',
  description: 'A floor of the plan\'s "floors": its id, its name, its level (2, level 2) or a word of its name (third). Every floor when left out.',
  examples: ['ground', 'first', 'Second floor', '2'],
  maxLength: ID_MAX,
}

/** Metres to two places, as every answer writes them. */
export function m(value: number): string {
  return value.toFixed(2)
}

/** The schema of a list of things that are all alike. */
export function listSchema(item: Record<string, unknown>): Record<string, unknown> {
  return { type: 'array', items: item }
}

export function objectSchema(properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): Record<string, unknown> {
  return { type: 'object', properties, required: [...required] }
}

export const NUMBER = { type: 'number' } as const
export const STRING = { type: 'string' } as const
export const BOOLEAN = { type: 'boolean' } as const
export const NULLABLE_NUMBER = { type: ['number', 'null'] } as const
export const NULLABLE_STRING = { type: ['string', 'null'] } as const
