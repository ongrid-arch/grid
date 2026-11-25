/**
 * `grid_write_brief` (BRF-1, lab AA-11): the agent writes what the person asked for, in one
 * call, before the first room: room areas and counts, inside sizes, the footprint, rooms that
 * must or must not touch, and the person's own figures, each with a level, the person's words
 * beside it and whether it was given or assumed, and what is still open. It writes only the
 * brief beside the plan (`brief/brief.ts`), never the plan. After that, every change to the plan
 * answers with each line met or missed (`brief/lines.ts`).
 */
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { BriefRefused, FIGURE_NAMES, FIGURES, FIGURES_HEADING, RATIO_MEASURES, type FigureName, LEVELS, parseBriefLines, QUOTE_MAX, briefFileOf, readBrief, SOURCES, writeBrief, type Brief, type BriefParts, type RefusedLine } from '../brief/brief'
import { briefLines, briefText, MAT } from '../brief/lines'
import { DOOR_MEASURES } from '../quantities/doorWidth'

/** What each figure's value is, in the tool's schema. */
const VALUE_SAYS: Readonly<Record<FigureName, string>> = {
  door_width: 'The smallest size, metres.',
  corridor_width: 'The smallest size, metres.',
  turning_circle: 'The smallest size, metres.',
  step: 'The highest step at a door, metres: 0 for none.',
  ceiling_height: 'The smallest size, metres.',
  plot_coverage: 'The most of the plot the building may cover, seen from above, as a percentage (40 for 40%).',
  floor_area_ratio: 'The most gross floor area, every floor at or above the ground floor, over the plot area (1.2).',
  building_height: 'The highest the building may stand, metres from the ground to the top of its roof.',
  parking_per_home: 'The fewest parking spaces per home, the spaces the floors state over the homes they state: 0 for none.',
}
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { loadPlan } from '../command/plan'
import { NAME_MAX } from '../command/planText'
import { PathRefused } from '../fs/projectFiles'
import { asRefusal, BOOLEAN, listSchema, NULLABLE_STRING, objectSchema, PLAN_ARG, planFileOf, projectOf, STRING, ToolRefusal, type GridTool } from './toolkit'

export const BRIEF_TOOL_NAME = 'grid_write_brief'

const SAID = {
  level: { type: 'string', enum: LEVELS, description: 'must, should, or avoid: a wish for the drawing not to hold it.' },
  source: { type: 'string', enum: SOURCES, description: 'given: the person said it, and quote keeps their words; assumed: you assumed it, for the person to confirm.' },
  quote: { type: 'string', maxLength: QUOTE_MAX, description: 'The person\'s own words for this wish, as they said them.' },
} as const

const NAME = { type: 'string', maxLength: NAME_MAX } as const
const SIZE = { type: 'number', exclusiveMinimum: 0 } as const

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    rooms: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        properties: {
          name: { ...NAME, description: 'One room, by the name it will have in the plan.' },
          use: { type: 'string', maxLength: 64, description: `Or the rooms of a use, with count for how many: one of ${ROOM_USES.join(', ')}, or a word that plainly means one in the person's language (cocina), kept as that use.` },
          count: { type: 'integer', minimum: 0, maximum: 1000, description: 'Exactly how many rooms of that name or use.' },
          count_at_least: { type: 'integer', minimum: 0, maximum: 1000, description: 'At least this many rooms of that name or use ("at least 4 toilet rooms"): a count, never at_least.' },
          count_at_most: { type: 'integer', minimum: 0, maximum: 1000, description: 'At most this many rooms of that name or use.' },
          area: { ...SIZE, description: 'About this net area, m².' },
          at_least: { ...SIZE, description: 'A net area of at least this, m². Square metres only: for how many rooms use count_at_least.' },
          at_most: { ...SIZE, description: 'A net area of at most this, m². Square metres only: for how many rooms use count_at_most.' },
          inside: { type: 'array', items: SIZE, minItems: 2, maxItems: 2, description: 'About this inside size, metres, either way round.' },
          ...SAID,
        },
        required: ['level', 'source'],
        additionalProperties: false,
      },
    },
    footprint: {
      type: 'object',
      properties: {
        width: { ...SIZE, description: 'Outside size one way, metres.' },
        depth: { ...SIZE, description: 'Outside size the other way, metres.' },
        area: { ...SIZE, description: 'The ground floor\'s gross external area, m².' },
        level: { type: 'string', enum: ['must', 'should'] },
        source: SAID.source,
        quote: SAID.quote,
      },
      required: ['level', 'source'],
      additionalProperties: false,
    },
    touch: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        properties: { rooms: { type: 'array', items: NAME, minItems: 2, maxItems: 2, description: 'Two rooms\' names.' }, ...SAID },
        required: ['rooms', 'level', 'source'],
        additionalProperties: false,
      },
    },
    figures: {
      type: 'object',
      description: FIGURES_HEADING,
      properties: Object.fromEntries(FIGURE_NAMES.map((figure) => [figure, {
        type: 'object',
        properties: {
          value: { type: 'number', minimum: FIGURES[figure].least, maximum: FIGURES[figure].top, description: VALUE_SAYS[figure] },
          ...(figure === 'turning_circle' ? { rooms: { type: 'array', items: NAME, maxItems: 500, description: 'The rooms it is for, by name. Every room when left out.' } } : {}),
          ...(figure === 'door_width' ? { measure: { type: 'string', enum: DOOR_MEASURES, description: 'The width the figure is for: clear (what the open door leaves, leaf by leaf), leaf (the leaf it opens by) or hole (the hole in the wall). Left out, clear.' } } : {}),
          ...(figure === 'floor_area_ratio' ? { measure: { type: 'string', enum: RATIO_MEASURES, description: 'The gross measure the ratio is set by. Left out, the usual one for the plan\'s place, else gross external, said as assumed.' } } : {}),
          level: { type: 'string', enum: ['must', 'should'] },
          source: SAID.source,
          quote: SAID.quote,
        },
        required: ['value', 'level', 'source'],
        additionalProperties: false,
      }])),
      additionalProperties: false,
    },
    open: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        properties: { quote: SAID.quote, about: { type: 'string', maxLength: QUOTE_MAX, description: 'What is still to ask, in your words.' } },
        required: ['quote'],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
}

const EXAMPLE = {
  rooms: [
    { name: 'Bathroom 1', area: 4.5, level: 'must', source: 'given', quote: 'a small bathroom, 4.5 square metres' },
    { use: 'bedroom', count: 3, level: 'must', source: 'given', quote: 'three bedrooms' },
    { name: 'Kitchen', inside: [3, 4], level: 'should', source: 'assumed' },
  ],
  footprint: { width: 10, depth: 12, level: 'should', source: 'given', quote: 'the plot takes about 10 by 12' },
  touch: [{ rooms: ['Kitchen', 'Bathroom 1'], level: 'avoid', source: 'given', quote: 'not the bathroom next to the kitchen' }],
  figures: { door_width: { value: 0.8, level: 'must', source: 'given', quote: 'my chair needs 80 cm doors' } },
  open: [{ quote: 'somewhere to work from home', about: 'its size, and which room' }],
}

const REFUSED = objectSchema({ where: STRING, problem: STRING, line: STRING })

const LINE = objectSchema({
  state: { type: 'string', enum: ['met', 'missed', 'open', 'differs'] },
  wish: STRING,
  level: NULLABLE_STRING,
  source: NULLABLE_STRING,
  quote: NULLABLE_STRING,
  asked: NULLABLE_STRING,
  drawn: NULLABLE_STRING,
  unit: NULLABLE_STRING,
  parts: listSchema(objectSchema({ kind: STRING, id: STRING })),
  text: STRING,
})

/** The brief's lines in an answer's data, on every change to the plan (BRF-1). */
export const BRIEF_OUTPUT = {
  type: 'object',
  properties: { file: NULLABLE_STRING, problem: NULLABLE_STRING, lines: listSchema(LINE) },
  required: ['file', 'problem', 'lines'],
}

/**
 * The plan as it is, or null when there is none yet: a brief is written before the first room.
 * A plan that is there and that Grid refuses is refused here, as by every tool, and nothing is
 * written.
 */
function planNow(project: ReturnType<typeof projectOf>, file: string): FloorPlan | null {
  return project.exists(file) ? loadPlan(project, file).plan : null
}

/** ARE-52: the lines left out, each with why and the line as sent, for the agent to mend and send again. */
function refusedText(refused: readonly RefusedLine[]): string[] {
  if (refused.length === 0) return []
  return [
    `${refused.length === 1 ? '1 line was' : `${refused.length} lines were`} left out and not written; mend ${refused.length === 1 ? 'it' : 'them'} and send the whole brief again with replace: true:`,
    ...refused.map((line) => `- ${line.where}: ${line.problem}. As sent: ${line.line}`),
  ]
}

export const writeBriefTool: GridTool = {
  name: BRIEF_TOOL_NAME,
  title: 'Write the brief',
  hint: 'write-file',
  description:
    'Use this when the person says what they want, before you draw the first room: in one call, write the brief from their words, each wish with its level (must, should, avoid), its source (given, with the person\'s words in quote, or assumed, for them to confirm), and what is still open. '
    + 'It holds room areas (m²) and counts, inside sizes and the footprint in metres, rooms that must touch or must not (avoid), and under figures the person\'s own figures, theirs and not from any code or standard: door_width, corridor_width, turning_circle, step and ceiling_height, and the site limits plot_coverage (%), floor_area_ratio (with the gross measure it is set by), building_height (m) and parking_per_home. A figure Grid does not know is refused with the ones it knows. A line that is wrong (a given wish with no quote, a number out of range) refuses only that line: the others are written, and the answer returns the refused line with why, in refused, for you to mend and send again with replace: true; a brief with no line Grid can read writes nothing. '
    + `It writes only the brief beside the plan (plan.brief.json beside plan.json), never the plan. A brief already there is not replaced unless replace is true: read it first (leave brief out), then write the whole brief with what changed. It answers with each line met or missed against the plan as drawn, measured as grid_areas and grid_measure measure, and a size written in a room's name (12 m², 6 tatami, a mat taken as ${MAT.width} × ${MAT.length} m) is read against the room until the brief gives one. Leave brief out to read the brief and its lines and write nothing. `
    + 'Every change to the plan then answers with the same lines. Do not use to change the plan (grid_write_rooms and the edit tools), for a rule from a code (grid_check), or to say a plan is allowed: a line met says only that the drawing holds what was asked.',
  args: {
    plan: { ...PLAN_ARG, description: 'The plan file the brief is for, as a path inside the project folder; it need not be written yet. The project\'s own plan.json when left out.' },
    replace: { type: 'boolean', description: 'true to write over a brief that is already beside the plan. false when left out: the brief there is kept and the call is refused.', examples: [true] },
    brief: {
      type: 'object',
      description: 'What the person asked for: rooms, footprint, touch, figures and open, any of them. Left out, the brief already kept is read and nothing is written.',
      examples: [EXAMPLE],
      schema: BRIEF_SCHEMA,
      read: (value) => {
        try {
          return parseBriefLines(value, { versionNeeded: false })
        } catch (error) {
          if (error instanceof BriefRefused) throw new ToolRefusal(`The brief was not written: ${error.message}.`)
          throw error
        }
      },
    },
  },
  outputSchema: objectSchema({
    written: NULLABLE_STRING,
    file: STRING,
    planDrawn: BOOLEAN,
    problem: NULLABLE_STRING,
    refused: listSchema(REFUSED),
    lines: listSchema(LINE),
  }),
  run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    try {
      // The plan's own path first, so a refusal names it as the call gave it.
      project.resolve(file)
      const parts = args['brief'] as BriefParts | undefined
      const given = parts?.brief
      const plan = planNow(project, file)
      let brief: Brief | null
      let written: string | null = null
      let problem: string | null = null
      const refused = parts?.refused ?? []
      let briefFile: string
      if (given === undefined) {
        const read = readBrief(project, file)
        brief = read.brief
        problem = read.problem
        briefFile = read.file
        // Reading writes nothing, so with no brief to read the plan must be there.
        if (brief === null && !project.exists(file)) throw new ToolRefusal(`There is no plan ${JSON.stringify(file)} and no brief beside it: pass brief to write one from the person's words.`)
      } else {
        brief = given
        if (args['replace'] !== true && project.exists(briefFileOf(file))) {
          const there = readBrief(project, file)
          throw new ToolRefusal(`There is already a brief beside the plan (${JSON.stringify(there.file)}), and it was not changed. Leave brief out to read it, then pass the whole brief with what changed and replace: true.`)
        }
        written = writeBrief(project, file, given)
        briefFile = written
      }
      const lines = briefLines(plan, brief)
      const head = written !== null
        ? [`Wrote the brief ${JSON.stringify(written)} beside the plan; the plan is as it was.`, ...refusedText(refused)]
        : brief === null
          ? [problem ?? `There is no brief beside the plan yet (${JSON.stringify(briefFile)}): pass brief to write one from the person's words.`]
          : [`Read the brief ${JSON.stringify(briefFile)}; nothing was written.`]
      const text = [...head, ...(plan === null ? ['The plan is not written yet, so every line is open until the rooms are drawn.'] : []), ...briefText(lines, brief === null ? null : briefFile, { quotes: true })]
      return { text: text.join('\n'), data: { written, file: briefFile, planDrawn: plan !== null, problem, refused, lines } }
    } catch (error) {
      if (error instanceof BriefRefused || error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw asRefusal(error)
    }
  },
}
