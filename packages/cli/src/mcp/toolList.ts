/**
 * CMD-52: each tool as `tools/list` shows it, short. A host reads the list on every turn, so it
 * holds what an agent needs to choose a tool and call it: its name, title and hints, its first
 * sentence (the "Use this when…" one), and each argument's type, allowed values and range, a
 * short first sentence and one short example. An argument that is an object lists its fields'
 * names and types only, and no output schema is listed: the answers carry the same data.
 * `grid_help` gives the rest, from `toolDefinition`, the full form.
 *
 * The short form is made from the full one mechanically, so no tool's own text is edited and a
 * tool another change adds is shortened the same way. The caps below are lengths of text in the
 * list, not measures of a plan.
 */
import { allArgs, toolDefinition, type GridTool } from './toolkit'

/** The longest first sentence of a tool's description the list gives, in characters. */
export const LISTED_DESCRIPTION_MAX = 300
/** The longest first sentence of an argument's description the list gives, in characters. */
export const LISTED_ARG_DESCRIPTION_MAX = 90
/**
 * The longest first sentence of an argument many tools share: the ones the server adds (whole,
 * page, language, based_on, who) and any described alike in `COMMON_ARG_TOOLS` tools or more
 * (plan, out, decimal…), which an agent reads once and grid_help gives whole.
 */
export const LISTED_SHARED_ARG_DESCRIPTION_MAX = 48
/** How many tools an argument's description must be the same in to be listed as a shared one. */
export const COMMON_ARG_TOOLS = 4
/** The longest example the list gives, as JSON; a longer one is left to grid_help. */
export const LISTED_EXAMPLE_MAX = 40

/** The keys of an argument's schema the list keeps: what a value is and may be, never its words. */
const STRUCTURE = ['type', 'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems'] as const

/**
 * The text's first sentence, ended where a full stop, question or exclamation mark is followed by
 * a capital letter, a quote or a bracket; one longer than `max` is cut at a word, with "…".
 */
export function firstSentence(text: string, max: number): string {
  const end = /[.!?](?=\s+["'(A-Z])/.exec(text)
  const sentence = (end === null ? text : text.slice(0, end.index + 1)).trim()
  if (sentence.length <= max) return sentence
  const cut = sentence.slice(0, max - 1)
  const word = cut.lastIndexOf(' ')
  return `${(word > max / 2 ? cut.slice(0, word) : cut).replace(/[\s,;:(]+$/, '')}…`
}

/** A schema's type only, or its variants' types: a field of an object argument, or an item's. */
function typeOnly(schema: unknown): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) return {}
  const s = schema as Record<string, unknown>
  if (s['type'] !== undefined) return { type: s['type'] }
  const variants = (s['anyOf'] ?? s['oneOf']) as unknown[] | undefined
  const types = [...new Set((variants ?? []).flatMap((one) => [typeOnly(one)['type'] ?? []].flat()))]
  return types.length === 0 ? {} : { type: types.length === 1 ? types[0] : types }
}

/** An argument's schema with its structure only: its own allowed values, its fields' and items' types. */
function structure(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of STRUCTURE) if (schema[key] !== undefined) out[key] = schema[key]
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[key])) out[key] = (schema[key] as unknown[]).map((one) => typeOnly(one))
  }
  const items = schema['items'] as Record<string, unknown> | undefined
  if (items !== undefined) out['items'] = items['enum'] === undefined ? typeOnly(items) : { ...typeOnly(items), enum: items['enum'] }
  const properties = schema['properties']
  if (typeof properties === 'object' && properties !== null) {
    out['properties'] = Object.fromEntries(Object.entries(properties).map(([name, one]) => [name, typeOnly(one)]))
  }
  return out
}

/** An example worth its place: of text, a list or an object, short; a number, a choice or true or false says itself. */
function listedExample(property: Record<string, unknown>): unknown[] | undefined {
  const examples = property['examples']
  if (!Array.isArray(examples) || examples.length === 0 || property['enum'] !== undefined) return undefined
  const first = examples[0] as unknown
  if (typeof first === 'number' || typeof first === 'boolean') return undefined
  return JSON.stringify(first).length <= LISTED_EXAMPLE_MAX ? [first] : undefined
}

/** One argument as the list gives it. */
function listedArg(property: Record<string, unknown>, shared: boolean): Record<string, unknown> {
  const out = structure(property)
  if (typeof property['description'] === 'string') out['description'] = firstSentence(property['description'], shared ? LISTED_SHARED_ARG_DESCRIPTION_MAX : LISTED_ARG_DESCRIPTION_MAX)
  const example = shared ? undefined : listedExample(property)
  if (example !== undefined) out['examples'] = example
  return out
}

/** The descriptions of the arguments described alike in `COMMON_ARG_TOOLS` of the tools or more. */
export function commonArgDescriptions(tools: readonly GridTool[]): ReadonlySet<string> {
  const counts = new Map<string, number>()
  for (const tool of tools) for (const spec of Object.values(tool.args)) counts.set(spec.description, (counts.get(spec.description) ?? 0) + 1)
  return new Set([...counts].filter(([, count]) => count >= COMMON_ARG_TOOLS).map(([description]) => description))
}

/** The tool as `tools/list` shows it: short, with `grid_help` for the rest. `common` from `commonArgDescriptions`. */
export function listedDefinition(tool: GridTool, common: ReadonlySet<string> = new Set()): Record<string, unknown> & { name: string } {
  const full = toolDefinition(tool)
  const input = full['inputSchema'] as { properties: Record<string, Record<string, unknown>>; required?: string[] }
  const args = allArgs(tool)
  const shared = new Set(Object.keys(args).filter((name) => !Object.hasOwn(tool.args, name) || common.has(args[name]!.description)))
  return {
    name: full.name,
    title: full['title'],
    description: firstSentence(tool.description, LISTED_DESCRIPTION_MAX),
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(input.properties).map(([name, property]) => [name, listedArg(property, shared.has(name))])),
      ...(input.required === undefined ? {} : { required: input.required }),
      additionalProperties: false,
    },
    // The title once: the annotations keep the hints.
    annotations: Object.fromEntries(Object.entries(full['annotations'] as Record<string, unknown>).filter(([key]) => key !== 'title')),
    ...(full['_meta'] === undefined ? {} : { _meta: full['_meta'] }),
  }
}

/** About how many tokens a text is, at four characters a token: the measure the list is held to. */
export function tokensOf(text: string): number {
  return Math.ceil(text.length / 4)
}
