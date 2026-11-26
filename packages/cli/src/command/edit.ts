/**
 * `grid edit <verb>`: the changes to a plan, as verbs of the command (WRT-3, CMD-4). Each verb is
 * one of the tool server's change tools, run the same way, so a sentence of request is one
 * command line as it is one call: `grid edit merge --room living --with kitchen`.
 *
 * A verb's options are its tool's arguments, with dashes for underscores; the plan file is the
 * one file it names, or the project's own plan. The answer is the tool's: what changed, what was
 * guessed and what could not be kept, with the file as a path in the project. With --json, the
 * same as data.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { openProject } from '../fs/projectFiles'
import { GRID_TOOLS } from '../mcp/serveTools'
import { readArgs, ToolRefusal, type ArgSpec, type GridTool } from '../mcp/toolkit'
import { helpText, parseOptions, PROJECT_OPTION, textOf, UsageError, type OptionSpecs } from './options'

/** A change the tool refused: one line, nothing written. */
export class EditCommandRefused extends Error {
  override readonly name = 'EditCommandRefused'
}

/** The verbs, each with the tool it runs. */
export const EDIT_VERBS = {
  opening: 'grid_change_opening',
  // WRT-38: one wall's thickness.
  wall: 'grid_change_wall',
  // CNT-15: one named wall, door or window type, which every part of it takes.
  type: 'grid_change_type',
  'move-side': 'grid_move_room_side',
  merge: 'grid_merge_rooms',
  split: 'grid_split_room',
  'add-room': 'grid_add_room',
  stretch: 'grid_stretch',
  rename: 'grid_rename_room',
  mirror: 'grid_mirror',
  square: 'grid_square_scan',
  // CNT-20: a library item or typical room placed by name.
  place: 'grid_place_item',
  // CNT-44: a room or zone filled with desks or seats at a pitch.
  fill: 'grid_fill_room',
  // WRT-72: a door, window or opening added to the plan.
  'add-opening': 'grid_add_opening',
  // WRT-73: phases set without hand-editing the file.
  phase: 'grid_set_phase',
  'start-works': 'grid_start_works',
  'phase-from': 'grid_phase_from',
  // VEW-67: the trace image under the plan set, placed, scaled and turned.
  trace: 'grid_place_trace',
  // WRT-75: a fit-out started on a base plan.
  'fit-out': 'grid_start_fit_out',
} as const

type Verb = keyof typeof EDIT_VERBS

const toolOf = (verb: Verb): GridTool => GRID_TOOLS.find((tool) => tool.name === EDIT_VERBS[verb])!
const optionOf = (arg: string): `--${string}` => `--${arg.replace(/_/g, '-')}`

function verbOptions(tool: GridTool): OptionSpecs {
  const specs: Record<`--${string}`, { takesValue: boolean; help: string }> = {}
  for (const [name, spec] of Object.entries(tool.args)) {
    if (name === 'plan') continue
    specs[optionOf(name)] = { takesValue: spec.type !== 'boolean', help: spec.description }
  }
  return { ...specs, '--json': { takesValue: false, help: 'Print the answer as JSON.' }, ...PROJECT_OPTION, '--help': { takesValue: false, help: 'Show this help.' } }
}

export const EDIT_SUMMARY = 'Changes the plan: one sentence of request is one command. Verbs: opening, type, move-side, merge, split, add-room, stretch, rename, mirror, square, place, fill, add-opening, phase, start-works, phase-from, fit-out.'
export const EDIT_USAGE = 'grid edit <verb> [<plan.json>] [options] [--json] [--project <folder>]'

function editHelp(): string {
  const width = Math.max(...Object.keys(EDIT_VERBS).map((v) => v.length))
  return [
    `Usage: ${EDIT_USAGE}`,
    '',
    EDIT_SUMMARY,
    '',
    'Verbs:',
    ...(Object.keys(EDIT_VERBS) as Verb[]).map((verb) => `  ${verb.padEnd(width + 2)}${toolOf(verb).title}.`),
    '',
    'Run grid edit <verb> --help for its options. The plan file is replaced unless --out names another.',
    '',
  ].join('\n')
}

/** An option's text as the argument its tool takes. */
function valueOf(name: string, spec: ArgSpec, text: string | true): unknown {
  if (spec.type === 'boolean') return true
  // CNT-15: a list is given as one option, its items split at commas: --parts w1,w2.
  if (spec.type === 'array' && typeof text === 'string') return text.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
  // WRT-7: a length goes to the tool as typed, and its reader takes the unit or the decimal comma.
  if (spec.type === 'number' && spec.length === true && typeof text === 'string') return text
  if (spec.type === 'number') {
    const value = Number(text)
    if (typeof text !== 'string' || text.trim() === '' || !Number.isFinite(value)) throw new UsageError(`${optionOf(name)} takes a number, in metres: for example ${spec.examples[0]}.`)
    return value
  }
  return text
}

/**
 * CMD-29: a yes-or-no option is given by naming it, and the tool's help says "true": so
 * `--zones true` is taken as `--zones`, and `--zones false` as leaving it out.
 */
function withBooleanWords(args: readonly string[], tool: GridTool): string[] {
  const flags = new Set<string>(Object.entries(tool.args).filter(([, spec]) => spec.type === 'boolean').map(([name]) => optionOf(name)))
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const next = args[i + 1]
    if (flags.has(arg) && (next === 'true' || next === 'false')) {
      if (next === 'true') out.push(arg)
      i++
    } else out.push(arg)
  }
  return out
}

/** The tool's words for an argument, as the command line's option. */
function asOptions(message: string, tool: GridTool): string {
  let text = message
  for (const name of Object.keys(tool.args)) {
    text = text.replace(new RegExp(`^${name} `), `${optionOf(name)} `).replace(new RegExp(`^Pass ${name}:`), `Pass ${optionOf(name)}:`)
  }
  return text
}

export async function runEdit(args: readonly string[], cwd: string, stdout: (text: string) => void): Promise<void> {
  const [verb, ...rest] = args
  if (verb === undefined || verb === '--help' || verb === '-h') {
    if (verb === undefined) throw new UsageError(`edit needs a verb: ${Object.keys(EDIT_VERBS).join(', ')}. Run grid edit --help for more.`)
    stdout(editHelp())
    return
  }
  if (!Object.hasOwn(EDIT_VERBS, verb)) throw new UsageError(`edit has no verb ${JSON.stringify(verb)}. Its verbs: ${Object.keys(EDIT_VERBS).join(', ')}.`)
  const tool = toolOf(verb as Verb)
  const options = verbOptions(tool)
  const parsed = parseOptions(`edit ${verb}`, withBooleanWords(rest, tool), options)
  if (parsed.values.has('--help')) {
    stdout(helpText(`grid edit ${verb} [<plan.json>] [options]`, `${tool.title}. ${tool.description.replace(/^Use this when /, 'For when ')}`, options))
    return
  }
  if (parsed.positionals.length > 1) throw new UsageError(`edit ${verb} takes one plan file, but was given ${parsed.positionals.length}.`)
  const plan = parsed.positionals[0]
  if (plan === '-') throw new UsageError(`edit ${verb} reads a plan from a file, not from standard input: name the file.`)
  const given: Record<string, unknown> = plan === undefined ? {} : { plan }
  for (const [name, spec] of Object.entries(tool.args)) {
    const value = parsed.values.get(optionOf(name))
    if (value !== undefined) given[name] = valueOf(name, spec, value)
  }
  let checked: Record<string, unknown>
  try {
    checked = readArgs(tool, given)
  } catch (error) {
    if (error instanceof ToolRefusal) throw new UsageError(asOptions(error.message, tool))
    throw error
  }
  const project = openProject(textOf(parsed, '--project'), cwd, 'project')
  let answer
  try {
    answer = await tool.run(checked, { project })
  } catch (error) {
    if (error instanceof ToolRefusal) throw new EditCommandRefused(asOptions(error.message, tool).replace(/\s+/g, ' ').trim())
    throw error
  }
  stdout(parsed.values.has('--json') ? `${JSON.stringify({ label: GENERAL_GUIDANCE_LABEL, ...answer.data }, null, 2)}\n` : `${answer.text}\n`)
}
