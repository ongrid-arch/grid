/**
 * The reading commands (CMD-48): `grid areas`, `schedule`, `takeoff`, `measure`, `count`, `find`,
 * `fields`, `compare` and `brief`, each one of the tool server's reading tools, run the way the
 * server runs it, so a shell, a script or CI gets the answer an agent gets.
 *
 * A command's options are its tool's arguments, with dashes for underscores, as `grid edit`'s
 * verbs take theirs; the plan file is the one file it names, or the project's own plan. It prints
 * the tool's text; `--json` prints exactly the tool's structured answer, never shortened;
 * `--csv` the table, where the answer is one; and `--fail-on` makes it exit 3 when the answer
 * holds the condition named, after printing it.
 */
import { openProject } from '../fs/projectFiles'
import { serverTool, GRID_TOOLS } from '../mcp/serveTools'
import { readArgs, ToolRefusal, type GridTool } from '../mcp/toolkit'
import { csv } from '../quantities/units'
import { asOptions, optionOf, valueOf, withBooleanWords } from './edit'
import { helpText, parseOptions, PROJECT_OPTION, textOf, UsageError, type OptionSpecs } from './options'

/** A reading tool refused the call: one line, exit 1. */
export class ReadCommandRefused extends Error {
  override readonly name = 'ReadCommandRefused'
}

type Data = Readonly<Record<string, unknown>>

/** A condition `--fail-on` names: what it means, and whether the answer holds it. */
interface Condition {
  readonly help: string
  /** Why the condition means nothing for this call, before anything runs; null when it does. */
  readonly refuse?: (args: Readonly<Record<string, unknown>>) => string | null
  readonly holds: (data: Data) => boolean
}

interface ReadCommand {
  readonly tool: GridTool['name']
  readonly usage: string
  readonly summary: string
  /** The tool's arguments the command line gives in its own way, or never. */
  readonly without?: readonly string[]
  /** How the answer is a table: the tool's own CSV, the command's own, or none. */
  readonly csv?: 'tool' | ((data: Data) => string)
  readonly failOn: Readonly<Record<string, Condition>>
}

const list = (value: unknown): readonly Record<string, unknown>[] => (Array.isArray(value) ? (value as Record<string, unknown>[]) : [])
const answerOf = (data: Data): Record<string, unknown> => (data['answer'] ?? {}) as Record<string, unknown>

const FOUND: Readonly<Record<string, Condition>> = {
  found: { help: 'at least one part is found', holds: (data) => Number(data['count']) > 0 },
  none: { help: 'no part is found', holds: (data) => Number(data['count']) === 0 },
}

/** A field's value as a CSV cell. */
function cell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('; ')
  return JSON.stringify(value)
}

/** grid find's rows: each part's id, then the fields asked for. */
function findCsv(data: Data): string {
  const fields = (data['fields'] as readonly string[] | undefined) ?? []
  return csv(['id', ...fields], list(data['rows']).map((row) => [cell(row['id']), ...fields.map((field) => cell(row[field]))]))
}

/** grid count's groups: the value, the count and each sum, then the total. */
function countCsv(data: Data): string {
  const groups = list(data['groups'])
  const total = (data['total'] ?? {}) as Record<string, unknown>
  const sums = [...new Set([...groups, total].flatMap((group) => Object.keys((group['sums'] ?? {}) as object)))]
  const row = (value: string | number | null, group: Record<string, unknown>): (string | number | null)[] => [value, cell(group['count']), ...sums.map((sum) => cell(((group['sums'] ?? {}) as Record<string, unknown>)[sum]))]
  const by = typeof data['by'] === 'string' ? data['by'] : 'group'
  return csv([by, 'count', ...sums], [...groups.map((group) => row(cell(group['value']), group)), row('total', total)])
}

const SHORT_OF: Readonly<Record<string, (answer: Record<string, unknown>) => boolean>> = {
  fit: (answer) => answer['fits'] === false,
  narrow: (answer) => list(answer['openings']).length + list(answer['rooms']).length > 0,
  route: (answer) => answer['found'] === false || answer['through'] === false,
  use: (answer) => list(answer['indicators']).some((indicator) => indicator['under'] === true),
}

export const READ_COMMANDS: Readonly<Record<string, ReadCommand>> = {
  areas: {
    tool: 'grid_areas',
    usage: 'grid areas [<plan.json>] [options] [--json | --csv] [--fail-on unproven] [--project <folder>]',
    summary: 'Prints the net, gross internal and gross external areas, by floor, room and use, as grid_areas gives them.',
    csv: 'tool',
    failOn: {
      unproven: { help: 'a figure is not proven from the drawing', holds: (data) => Object.values((data['states'] ?? {}) as Record<string, { state?: unknown }>).some((figure) => figure?.state !== 'proven') },
    },
  },
  schedule: {
    tool: 'grid_schedule',
    usage: 'grid schedule [<plan.json>] [--of rooms|openings|doors|windows|flats|finishes|fixtures] [options] [--json | --csv] [--fail-on found|none] [--project <folder>]',
    summary: 'Prints a schedule of rooms, doors, windows, flats, finishes or fixtures, as grid_schedule gives it.',
    csv: 'tool',
    failOn: {
      found: { help: 'the schedule has at least one row', holds: (data) => list(data['rows']).length > 0 },
      none: { help: 'the schedule has no row', holds: (data) => list(data['rows']).length === 0 },
    },
  },
  takeoff: {
    tool: 'grid_takeoff',
    usage: 'grid takeoff [<plan.json>] [--for estimate|change] [options] [--json | --csv] [--fail-on assumed] [--project <folder>]',
    summary: 'Prints the quantities to build it: walls, floors, ceilings, skirting and wall faces, and with --for a bill of quantities, as grid_takeoff gives them.',
    csv: 'tool',
    failOn: {
      assumed: {
        help: 'a line of the bill is assumed, not measured (with --for)',
        refuse: (args) => (args['for'] === undefined ? '--fail-on assumed goes with --for estimate or --for change: only a bill has lines that may be assumed.' : null),
        holds: (data) => list(data['lines']).some((line) => line['assumed'] === true),
      },
    },
  },
  measure: {
    tool: 'grid_measure',
    usage: 'grid measure <what> [<plan.json>] [options] [--json] [--fail-on short] [--project <folder>]',
    summary: 'Measures a room, a wall, the distance between two parts, whether something fits, a route, what is narrow and more, as grid_measure does. <what> is the same as --what.',
    failOn: {
      short: {
        help: `the measure falls short: for ${Object.keys(SHORT_OF).join(', ')}`,
        refuse: (args) => (Object.hasOwn(SHORT_OF, String(args['what'])) ? null : `--fail-on short goes with measuring ${Object.keys(SHORT_OF).join(', ')}, where an answer can fall short.`),
        holds: (data) => SHORT_OF[String(data['what'])]?.(answerOf(data)) === true,
      },
    },
  },
  count: {
    tool: 'grid_count',
    usage: 'grid count [<plan.json>] [--kind <kinds>] [--where <tests>] [--by <field>] [options] [--json | --csv] [--fail-on found|none] [--project <folder>]',
    summary: 'Counts parts by kind, field or fact, in groups, with sums, as grid_count does. A list option takes its items split at commas.',
    csv: countCsv,
    failOn: {
      found: { help: 'at least one part is counted', holds: (data) => Number(((data['total'] ?? {}) as Record<string, unknown>)['count']) > 0 },
      none: { help: 'no part is counted', holds: (data) => Number(((data['total'] ?? {}) as Record<string, unknown>)['count']) === 0 },
    },
  },
  find: {
    tool: 'grid_find',
    usage: 'grid find [<plan.json>] [--kind <kinds>] [--where <tests>] [--fields <names>] [options] [--json | --csv] [--fail-on found|none] [--project <folder>]',
    summary: 'Finds the parts that meet every condition, with the fields asked for, as grid_find does. A list option takes its items split at commas.',
    csv: findCsv,
    failOn: FOUND,
  },
  fields: {
    tool: 'grid_fields',
    usage: 'grid fields [<plan.json>] [--kind <kinds>] [--json] [--project <folder>]',
    summary: 'Lists the fields and facts each kind of part has, to ask grid find and grid count by, as grid_fields does.',
    failOn: {},
  },
  compare: {
    tool: 'grid_compare',
    usage: 'grid compare <plan.json> <plan.json>... [--labels <names>] [--floor <id>] [--json] [--fail-on differs] [--project <folder>]',
    summary: 'Compares 2 to 6 plans, the first with each of the others: their areas side by side, what moved and what changed, as grid_compare does.',
    without: ['plans', 'picture'],
    failOn: {
      differs: { help: 'a plan is not the same building as the first', holds: (data) => list(data['comparisons']).some((comparison) => comparison['likeness'] !== 'same') },
    },
  },
  brief: {
    tool: 'grid_write_brief',
    usage: 'grid brief [<plan.json>] [--json] [--fail-on missed|open] [--project <folder>]',
    summary: 'Reads the brief beside the plan and says each line met or missed, as grid_write_brief does when no brief is sent. It writes nothing.',
    without: ['replace', 'brief'],
    failOn: {
      missed: { help: 'a line of the brief is missed', holds: (data) => list(data['lines']).some((line) => line['state'] === 'missed') },
      open: { help: 'a line of the brief is still open', holds: (data) => list(data['lines']).some((line) => line['state'] === 'open') },
    },
  },
}

export const READ_COMMAND_NAMES = Object.keys(READ_COMMANDS)

export function isReadCommand(name: string): boolean {
  return Object.hasOwn(READ_COMMANDS, name)
}

const toolOf = (command: ReadCommand): GridTool => GRID_TOOLS.find((tool) => tool.name === command.tool)!

/**
 * A tool's refusal with its arguments spelt as the command line's options: `of=openings` as
 * `--of openings`, and a name with an underscore, which is no word of a sentence, wherever it is.
 */
function spelt(message: string, tool: GridTool): string {
  let text = asOptions(message, tool)
  for (const name of Object.keys(tool.args)) {
    text = text.replace(new RegExp(`\\b${name}=`, 'g'), `${optionOf(name)} `)
    if (name.includes('_')) text = text.replace(new RegExp(`(?<!-)\\b${name}\\b`, 'g'), optionOf(name))
  }
  return text
}

/** The command's own arguments: the tool's, less the plan and those it gives otherwise. */
function argsOf(command: ReadCommand, tool: GridTool): [string, GridTool['args'][string]][] {
  const without = new Set(['plan', ...(command.without ?? [])])
  return Object.entries(tool.args).filter(([name]) => !without.has(name))
}

export function readOptions(command: ReadCommand): OptionSpecs {
  const tool = toolOf(command)
  const specs: Record<`--${string}`, { takesValue: boolean; help: string }> = {}
  for (const [name, spec] of argsOf(command, tool)) specs[optionOf(name)] = { takesValue: spec.type !== 'boolean', help: spec.description }
  specs['--json'] = { takesValue: false, help: "Print exactly the tool's structured answer, as JSON." }
  if (command.csv !== undefined) specs['--csv'] = { takesValue: false, help: 'Print the table as comma-separated values, its first row the label.' }
  const conditions = Object.entries(command.failOn)
  if (conditions.length > 0) specs['--fail-on'] = { takesValue: true, help: `Exit 3, after printing the answer, when ${conditions.map(([word, condition]) => `${word}: ${condition.help}`).join('; ')}.` }
  return { ...specs, ...PROJECT_OPTION, '--help': { takesValue: false, help: 'Show this help.' } }
}

/** The plan files and the rest of the arguments the positionals give. */
function positionalArgs(name: string, positionals: readonly string[], tool: GridTool, given: Record<string, unknown>): void {
  if (positionals.includes('-')) throw new UsageError(`${name} reads a plan from a file, not from standard input: name the file.`)
  if (name === 'compare') {
    if (positionals.length < 2 || positionals.length > 6) throw new UsageError(`compare takes 2 to 6 plan files, the first compared with each of the others, but was given ${positionals.length}: grid compare a.json b.json.`)
    given['plans'] = [...positionals]
    return
  }
  let rest = positionals
  if (name === 'measure') {
    const whats = (tool.args['what'] as { enum?: readonly string[] }).enum ?? []
    const [first] = positionals
    if (first !== undefined && whats.includes(first)) {
      if (given['what'] !== undefined) throw new UsageError(`measure was given what to measure twice: as ${JSON.stringify(first)} and with --what. Give it once.`)
      given['what'] = first
      rest = positionals.slice(1)
    } else if (given['what'] === undefined) throw new UsageError(`measure needs what to measure, as its first word: ${whats.join(', ')}.`)
  }
  if (rest.length > 1) throw new UsageError(`${name} takes one plan file, but was given ${rest.length}.`)
  if (rest[0] !== undefined) given['plan'] = rest[0]
}

/**
 * Runs one reading command. Resolves to whether the answer holds the `--fail-on` condition, for
 * the command to exit 3.
 */
export async function runRead(name: string, args: readonly string[], cwd: string, stdout: (text: string) => void): Promise<boolean> {
  const command = READ_COMMANDS[name]!
  const tool = toolOf(command)
  const options = readOptions(command)
  const parsed = parseOptions(name, withBooleanWords(args, tool), options)
  if (parsed.values.has('--help')) {
    stdout(helpText(command.usage, `${command.summary} ${tool.description.replace(/^Use this when /, 'For when ')}`, options))
    return false
  }
  const json = parsed.values.has('--json')
  const asCsv = parsed.values.has('--csv')
  if (json && asCsv) throw new UsageError('--json and --csv were both given: give one.')
  const failWord = textOf(parsed, '--fail-on')
  const condition = failWord === undefined ? undefined : command.failOn[failWord]
  if (failWord !== undefined && (condition === undefined || !Object.hasOwn(command.failOn, failWord))) {
    throw new UsageError(`--fail-on takes ${Object.keys(command.failOn).join(' or ')}.`)
  }
  const given: Record<string, unknown> = {}
  for (const [arg, spec] of argsOf(command, tool)) {
    const value = parsed.values.get(optionOf(arg))
    if (value !== undefined) given[arg] = valueOf(arg, spec, value)
  }
  positionalArgs(name, parsed.positionals, tool, given)
  if (asCsv && command.csv === 'tool') {
    if (given['format'] === 'text') throw new UsageError('--csv and --format text were both given: give one.')
    given['format'] = 'csv'
  }
  let checked: Record<string, unknown>
  try {
    checked = readArgs(tool, given)
  } catch (error) {
    if (error instanceof ToolRefusal) throw new UsageError(spelt(error.message, tool))
    throw error
  }
  const refused = condition?.refuse?.(checked) ?? null
  if (refused !== null) throw new UsageError(refused)
  const project = openProject(textOf(parsed, '--project'), cwd, 'project')
  // The tool server's own path, so the text and the data are the server's; whole, never shortened.
  const answer = await serverTool(tool, { project }).call({ ...given, whole: true })
  if (answer.isError === true) throw new ReadCommandRefused(spelt(answer.text, tool).replace(/\s+/g, ' ').trim())
  const data = answer.data ?? {}
  if (json) stdout(`${JSON.stringify(data, null, 2)}\n`)
  else if (asCsv && typeof command.csv === 'function') stdout(command.csv(data))
  else stdout(answer.text.endsWith('\n') ? answer.text : `${answer.text}\n`)
  return condition?.holds(data) ?? false
}
