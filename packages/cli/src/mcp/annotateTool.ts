/**
 * Writing on the drawing's tool (SHT-22): `grid_annotate` places notes, tags, symbols, the key,
 * routes drawn as arrows and sketch items in the plan's own `annotations` and `sketch`, by floor,
 * by room or at a point, and takes them out by id. One entry from the call's own arguments, or
 * many as rooms text lines (`lines`), read by rooms text's own reading (`rooms/notes.ts`). It goes
 * through `writeChange`, as every change does, and changes the drawing only, never the building
 * or the ground: it comes after the site's tools and before the saved views. The change is
 * `edit/annotate.ts`.
 *
 * A point is text, `x,y`, as rooms text writes it (a tool's lists hold text): each length in
 * metres, or with its unit.
 */
import { NOTE_KINDS, noteOfLine, type NoteKind, type NoteWords } from '@ongrid/floorplan/rooms'
import { ANNOTATION_SYMBOLS } from '@ongrid/floorplan/types/floorplan'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { annotate } from '../edit/annotate'
import { NAME_MAX } from '../command/planText'
import { FLOOR_ARG, DECIMAL_IN_ARG, floorArg, listSchema, PLAN_ARG, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

type Pair = [number, number]

/** The most points and lines one call takes, the longest point text and line, and the farthest a point lies. */
const POINTS_MAX = 2000
const LINES_MAX = 500
const POINT_MAX = 60
const LINE_MAX = 4000
const LARGEST = 100_000

/** A point written `x,y`, each length in metres or with its unit; refused naming the argument. */
function pointArg(name: string, text: string): Pair {
  const usage = `${name} takes points written x,y, each a length in metres or with its unit (3.5,0 or 12ft,0), with a decimal point.`
  const parts = text.split(',').map((p) => p.trim())
  if (parts.length !== 2 || parts.some((p) => p === '')) throw new ToolRefusal(usage)
  const length = (part: string): number => {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(part)) return Number(part)
    try {
      return readLength(part)
    } catch (error) {
      if (error instanceof LengthRefused) throw new ToolRefusal(usage)
      throw error
    }
  }
  const point: Pair = [length(parts[0]!), length(parts[1]!)]
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= LARGEST)) throw new ToolRefusal(`${name} takes points within ${LARGEST} m of the drawing's origin.`)
  return point
}

/** The fields of one entry the call gives by its own arguments. */
const ENTRY_ARGS = ['text', 'symbol', 'at', 'room', 'turn', 'points', 'category', 'radius', 'start', 'end', 'id'] as const

/** The one entry the call's own arguments give, or null when they give none. */
function entryOf(args: Record<string, unknown>): NoteWords | null {
  const given = ENTRY_ARGS.filter((key) => args[key] !== undefined)
  if (args['kind'] === undefined) {
    if (given.length > 0) throw new ToolRefusal(`${given.join(', ')} ${given.length === 1 ? 'describes' : 'describe'} one entry: give its kind too (${NOTE_KINDS.join(', ')}), or write it as one of lines.`)
    return null
  }
  const text = (key: string): string | undefined => args[key] as string | undefined
  const number = (key: string): number | undefined => args[key] as number | undefined
  return {
    kind: args['kind'] as NoteKind,
    ...(text('id') === undefined ? {} : { id: text('id')! }),
    ...(text('text') === undefined ? {} : { text: text('text')!.normalize('NFC') }),
    ...(text('symbol') === undefined ? {} : { symbol: text('symbol')! }),
    ...(text('at') === undefined ? {} : { at: pointArg('at', text('at')!) }),
    ...(text('room') === undefined ? {} : { room: text('room')! }),
    ...(number('turn') === undefined ? {} : { turn: number('turn')! }),
    ...(args['points'] === undefined ? {} : { points: (args['points'] as string[]).map((p) => pointArg('points', p)) }),
    ...(text('category') === undefined ? {} : { category: text('category')! }),
    ...(number('radius') === undefined ? {} : { radius: number('radius')! }),
    ...(number('start') === undefined ? {} : { start: number('start')! }),
    ...(number('end') === undefined ? {} : { end: number('end')! }),
  }
}

/** Each of `lines` read as rooms text reads it, its refusal naming the line. */
function linesOf(lines: readonly string[]): Array<{ words: NoteWords; from: string }> {
  return lines.map((line, k) => {
    const from = `lines[${k}]`
    try {
      return { words: noteOfLine(line), from }
    } catch (error) {
      if (error instanceof Error && /^rooms\//.test(String((error as { code?: unknown }).code))) throw new ToolRefusal(`${from}: ${error.message.replace(/^./, (c) => c.toLowerCase())}`)
      throw error
    }
  })
}

const number = (description: string, examples: number[], minimum: number, maximum: number, length = true): GridTool['args'][string] => ({ type: 'number', length, description, examples, minimum, maximum })

export const annotateTool: GridTool = {
  name: 'grid_annotate',
  title: 'Place notes, tags, symbols, routes and sketch lines on the drawing',
  hint: 'change-plan',
  description:
    'Use this when the person wants something written or sketched on the plan\'s drawing: "you are here", a tag on each fire extinguisher, the way out drawn as an arrow, "mark the entrance", a note in a room, a north arrow, the key, a garden, a street or a fence sketched round the building. '
    + 'It places the plan\'s own annotations and sketch, which the drawing, grid_view, the sheet and the DXF export show: never redraw the plan in a picture of your own to add them. Each goes by floor, in a room (under its name) or at a point: kind note or tag with text, symbol (north or entrance, turned by turn), key, route (a line through points with an arrowhead at its end, category route unless given), or a sketch line, shape, rect, arc or text with its category, the author\'s word for it (garden, street). '
    + 'One entry from kind and its arguments, or many at once as lines, each a rooms text line: tag "You are here" at 3,4; tag "FE" in kitchen; symbol entrance at 2,-0.5; route exit 2,5 2,1 6,1 on first; sketch shape garden 0,-1 8,-1 8,-6 0,-6. floor puts an entry that names none on that floor (the ground floor when left out); remove takes entries out by id first. Ids are tag-1, route-1, sketch-1 and so on when left out. '
    + 'It answers with each entry placed (its id, what it is, where and on which floor) and what the drawing carries on each floor. Nothing placed is measured or checked. '
    + 'Do not use for rooms, doors, fixtures (grid_place_item), the plot or its trees and paths (grid_set_site, grid_change_site), or a room\'s number (grid_set_facts). Rooms text writes the same lines. It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    kind: { type: 'string', enum: NOTE_KINDS, description: 'One entry: what it is. note and tag take text; symbol takes symbol; key may stand alone, under the drawing; route, line and shape take points; rect two points, opposite corners; arc at, radius, start and end; text at and text.', examples: ['tag', 'route'] },
    text: { type: 'string', maxLength: NAME_MAX, description: 'The words of a note, a tag, a symbol\'s label or a sketch text.', examples: ['You are here', 'FE'] },
    symbol: { type: 'string', enum: ANNOTATION_SYMBOLS, description: 'Which symbol.', examples: ['entrance'] },
    at: { type: 'string', maxLength: POINT_MAX, description: 'Where it goes, "x,y" in plan metres: a note, tag, symbol or key, or an arc\'s centre or a sketch text.', examples: ['3,4'] },
    room: { type: 'string', id: true, description: 'In place of at: the room a note, tag or symbol goes in, under the room\'s name, on the room\'s floor.', examples: ['kitchen'] },
    floor: { ...FLOOR_ARG, description: 'The floor an entry placed at a point is on, when it names none: for kind and for each of lines without on.', examples: ['first'] },
    turn: number('A symbol\'s turn, degrees counter-clockwise; a north symbol points to the plan\'s north when left out.', [-30], -360, 360, false),
    points: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 2, maxItems: POINTS_MAX, description: 'A route\'s, a line\'s or a shape\'s points in order, or a rect\'s two opposite corners, each "x,y". A route\'s arrowhead goes at its last point.', examples: [['2,5', '2,1', '6,1']] },
    category: { type: 'string', id: true, description: 'A sketch item\'s or a route\'s word for what it is: it names its layer in an export and its line in the key.', examples: ['exit', 'garden'] },
    radius: number('An arc\'s radius.', [1.5], 0.01, 10_000),
    start: number('An arc\'s start, degrees counter-clockwise from east (+x).', [0], -360, 360, false),
    end: number('An arc\'s end, degrees; the arc runs counter-clockwise from start.', [90], -360, 360, false),
    id: { type: 'string', id: true, description: 'One entry\'s id; <kind>-<n> (route-<n>, sketch-<n> for sketch items) when left out.', examples: ['here', 'fe-1'] },
    lines: { type: 'array', items: { maxLength: LINE_MAX }, minItems: 1, maxItems: LINES_MAX, description: 'Many entries at once, each a rooms text line: note|tag "<text>" at x,y | in <room>; symbol north|entrance at x,y [turn <deg>]; key [at x,y]; route [<category>] x,y x,y ...; sketch line|shape|rect <category> x,y ...; sketch arc <category> at x,y radius <m> start <deg> end <deg>; sketch text <category> at x,y "<text>"; each may end on <floor> and id <id>.', examples: [['tag "You are here" at 3,4', 'tag "FE" in kitchen', 'route exit 2,5 2,1 6,1']] },
    remove: { type: 'array', items: { id: true }, minItems: 1, maxItems: POINTS_MAX, description: 'Ids of notes, tags, symbols, keys, routes or sketch items to take out, before anything is placed.', examples: [['tag-1', 'route-2']] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), placed: listSchema(STRING), removed: listSchema(STRING), annotations: listSchema(STRING), sketch: listSchema(STRING) } },
  run(args, context) {
    const entry = entryOf(args)
    const add = [...(entry === null ? [] : [{ words: entry, from: `The ${entry.kind}` }]), ...linesOf((args['lines'] as string[] | undefined) ?? [])]
    let after: { annotations: string[]; sketch: string[] } = { annotations: [], sketch: [] }
    const changed = writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor']) ?? null
      const patch = annotate(survey, { add, remove: (args['remove'] as string[] | undefined) ?? [], floor })
      const ids = (key: string): string[] => ((patch.plan?.[key] as { id: string }[] | null | undefined) ?? []).map((p) => p.id)
      after = { annotations: ids('annotations'), sketch: ids('sketch') }
      return patch
    })
    return { text: changed.text, data: { ...changed.data, ...after } }
  },
}
