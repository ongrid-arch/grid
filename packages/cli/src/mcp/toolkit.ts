/**
 * What every tool of `grid serve` shares: how a tool is written down, how its arguments are
 * read, and how it finds the plan, the floor and the room it was asked about.
 *
 * One description of each argument gives both the input schema `tools/list` shows and the
 * check a call goes through, so the two cannot drift apart. A refusal names the argument and
 * what it takes. It never repeats the value it was sent: that is text from the agent, and may
 * be anything (MS-19, T-3).
 */
import { GENERAL_GUIDANCE_LABEL, planFloors, type FloorPlan } from '@ongrid/floorplan/geometry'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { PATH_MAX, PathRefused, quoted, type Project } from '../fs/projectFiles'
import { PROJECT_FILE, projectPlanFile } from '../command/init'
import { UsageError } from '../command/options'
import { loadPlan, PlanRefused, type LoadedPlan, type LoadOptions } from '../command/plan'
import { ID_MAX as PLAN_ID_MAX, UNSAFE_TEXT } from '../command/planText'

/** WRT-7: the decimal mark the call's lengths are typed with. */
export const DECIMAL_IN_ARG: ArgSpec = {
  type: 'string',
  enum: ['point', 'comma'],
  description: 'The decimal mark of the lengths typed as text in this call: point (3.81) or comma (3,81). point when left out.',
  examples: ['comma'],
}

/** The longest text a length argument may be, such as 12' 6 1/2" (WRT-7). */
export const LENGTH_TEXT_MAX = 40

/** The longest id an argument may hold: a floor, room, opening or wall id, as long as a plan file may hold. */
export const ID_MAX = PLAN_ID_MAX
/** What an id may hold: letters, digits, dash, underscore and dot (T-3). */
export const ID_PATTERN = '^[A-Za-z0-9._-]{1,64}$'
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
      readonly examples: readonly Record<string, unknown>[]
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
  /** AIV-19: for an MCP App's page alone (a drawing), sent as the result's `_meta`. */
  readonly meta?: Record<string, unknown>
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
    const { id, ...string } = rest
    delete string.lines
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

/**
 * MSG-3: every answer leads with the label "General guidance, not your local rules" and carries
 * it as `label` in its data. Done here, once, so no tool can leave it out. A refusal is not an
 * answer about the plan and is left as it is.
 */
export function labelled(answer: Answer): Answer {
  // A first line that holds it already (a CSV cell, a comment in rooms text) is left as it is.
  const first = answer.text.split('\n', 1)[0]!
  const text = first.includes(GENERAL_GUIDANCE_LABEL) ? answer.text : `${GENERAL_GUIDANCE_LABEL}\n${answer.text}`
  return { ...answer, text, data: { label: GENERAL_GUIDANCE_LABEL, ...answer.data } }
}

/** The output schema with the label every answer carries (MSG-3). */
function labelledSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema['properties'] as Record<string, unknown> | undefined
  if (properties === undefined) return schema
  const required = (schema['required'] as readonly string[] | undefined) ?? []
  return {
    ...schema,
    properties: { label: { type: 'string', const: GENERAL_GUIDANCE_LABEL }, ...properties },
    required: required.includes('label') ? [...required] : ['label', ...required],
  }
}

/** The tool as `tools/list` shows it. */
export function toolDefinition(tool: GridTool): Record<string, unknown> & { name: string } {
  const required = Object.entries(tool.args).filter(([, spec]) => spec.required).map(([name]) => name)
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(tool.args).map(([name, spec]) => [name, argSchema(spec)])),
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
      if (spec.id) {
        if (value.length > ID_MAX) throw new ToolRefusal(`${name} is longer than ${ID_MAX} characters, the most an id may have.`)
        if (!ID.test(value)) throw new ToolRefusal(`${name} must be an id of the plan: letters, digits, dash, underscore and dot only.`)
      }
      const max = spec.maxLength
      if (max !== undefined && value.length > max) throw new ToolRefusal(`${name} is longer than ${max} characters.`)
      const checked = spec.lines === true ? value.replace(/\r\n|\r|\n|\t/g, ' ') : value
      if (CONTROL.test(checked)) throw new ToolRefusal(`${name} holds a control or direction character${spec.lines === true ? ' other than a line break or a tab' : ''}.`)
      if (spec.enum && !spec.enum.includes(value)) throw new ToolRefusal(`${name} takes one of ${spec.enum.join(', ')}.`)
      return value
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
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal(`${name} takes an object.`)
      return spec.read(value, earlier)
    }
  }
}

/** The arguments of a call, checked against the tool's own list. */
export function readArgs(tool: GridTool, raw: unknown): Record<string, unknown> {
  const names = Object.keys(tool.args)
  if (raw === undefined) raw = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ToolRefusal(`Pass the arguments of ${tool.name} as an object${names.length > 0 ? `: ${listOf(names)}` : ''}.`)
  }
  const given = raw as Record<string, unknown>
  const unknown = Object.keys(given).filter((key) => !Object.hasOwn(tool.args, key))
  if (unknown.length > 0) {
    const shown = unknown.length > 3 ? `${unknown.length} others` : unknown.every((key) => key.length <= ID_MAX && ID.test(key)) ? listOf(unknown.map(quoted)) : 'others'
    throw new ToolRefusal(`${tool.name} takes ${names.length > 0 ? listOf(names) : 'no arguments'}, not ${shown}.`)
  }
  const args: Record<string, unknown> = {}
  // The decimal mark first: a length typed with a comma is read by it (WRT-7).
  const order = Object.entries(tool.args).sort(([a], [b]) => (a === 'decimal' ? -1 : b === 'decimal' ? 1 : 0))
  for (const [name, spec] of order) {
    const value = given[name]
    if (value === undefined || value === null) {
      if (spec.required) throw new ToolRefusal(`Pass ${name}: ${spec.description.split('. ')[0]!.replace(/\.$/, '')}.`)
      continue
    }
    args[name] = checkOne(name, spec, value, args)
  }
  return args
}

/** The project, or a refusal that says how to start the server with one. */
export function projectOf(context: ToolContext): Project {
  if (context.project instanceof PathRefused) {
    throw new ToolRefusal(`${context.project.message} For the tool server, start grid serve with --project <folder>.`)
  }
  return context.project
}

/** The plan file a call names, or the project's own plan when it names none. */
export function planFileOf(project: Project, plan: unknown): string {
  if (typeof plan === 'string') return plan
  const own = projectPlanFile(project)
  if (own === null) {
    throw new ToolRefusal(`Pass plan: the plan file, as a path inside the project folder. This folder holds no ${PROJECT_FILE}, so there is no plan to fall back on.`)
  }
  return own
}

/**
 * Reads the plan a call names, turning the command's refusals into a tool's. A tool that changes
 * the plan reads it whole (MSG-6), so it never writes back a plan without a part the reader left out.
 */
export function readPlan(context: ToolContext, plan: unknown, options: LoadOptions = {}): { project: Project; file: string; loaded: LoadedPlan } {
  const project = projectOf(context)
  const file = planFileOf(project, plan)
  try {
    return { project, file, loaded: loadPlan(project, file, options) }
  } catch (error) {
    throw asRefusal(error)
  }
}

/** The command's own refusals, as a tool refusal; anything else is thrown on. */
export function asRefusal(error: unknown): unknown {
  if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof UsageError) return new ToolRefusal(error.message)
  return error
}

/** The floors of a plan, quoted, for a refusal: ids are text from the plan file. */
function floorList(plan: FloorPlan): string {
  const floors = planFloors(plan)
  const shown = floors.slice(0, 20).map((floor) => quoted(floor.id))
  return `${listOf(shown)}${floors.length > 20 ? ` and ${floors.length - 20} more` : ''}`
}

/**
 * The floor a call asked for, checked against the plan. An unknown floor is refused with the
 * floors the plan has, and without the word that was sent (MS-19).
 */
export function floorArg(plan: FloorPlan, floor: unknown): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === floor)) return floor as string
  throw new ToolRefusal(`That floor is not in this plan. Its floors: ${floorList(plan)}.`)
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

/** A room the call named, checked against the plan, with the nearest id and the rooms it has when it is not there. */
export function roomArg(plan: FloorPlan, room: unknown, argument = 'room'): string {
  if (plan.rooms.some((r) => r.id === room)) return room as string
  const shown = plan.rooms.slice(0, 30).map((r) => `${quoted(r.id)} (${quoted(r.name)})`)
  const more = plan.rooms.length > 30 ? ` and ${plan.rooms.length - 30} more` : ''
  const nearest = nearestIdText(room, plan.rooms.map((r) => r.id))
  throw new ToolRefusal(`The ${argument} named is not a room of this plan.${nearest} Its rooms: ${shown.join(', ') || 'none'}${more}.`)
}

/** An opening the call named, checked against the plan, with the nearest id and the openings it has when it is not there. */
export function openingArg(plan: FloorPlan, opening: unknown): string {
  if (plan.openings.some((o) => o.id === opening)) return opening as string
  const shown = plan.openings.slice(0, 40).map((o) => `${quoted(o.id)} (${o.type})`)
  const more = plan.openings.length > 40 ? ` and ${plan.openings.length - 40} more` : ''
  const nearest = nearestIdText(opening, plan.openings.map((o) => o.id))
  throw new ToolRefusal(`The opening named is not in this plan.${nearest} Its doors, windows and openings: ${shown.join(', ') || 'none'}${more}.`)
}

/** A wall the call named, checked against the plan, with the nearest wall id when it is not there. */
export function wallArg(plan: FloorPlan, wall: unknown): string {
  if (plan.walls.some((w) => w.id === wall)) return wall as string
  const ids = plan.walls.map((w) => w.id)
  // No near id: its walls, so the agent can choose (MSG-7).
  const listed = ids.length === 0 ? ' It has no walls.' : ` Its walls: ${ids.slice(0, 40).map(quoted).join(', ')}${ids.length > 40 ? ` and ${ids.length - 40} more` : ''}.`
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
  if (plan.walls.some((w) => w.id === thing)) return { kind: 'wall', id: thing as string }
  if (plan.openings.some((o) => o.id === thing)) return { kind: 'opening', id: thing as string }
  if (plan.rooms.some((r) => r.id === thing)) return { kind: 'room', id: thing as string }
  if ((plan.items ?? []).some((i) => i.id === thing)) return { kind: 'item', id: thing as string }
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

export const FLOOR_ARG: ArgSpec = {
  type: 'string',
  id: true,
  description: 'A floor id from the plan\'s "floors". Every floor when left out.',
  examples: ['ground', 'first'],
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
