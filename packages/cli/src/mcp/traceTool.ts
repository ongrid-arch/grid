/**
 * VEW-67 (C31): `grid_place_trace` sets the plan's trace image, places, scales and turns it, and
 * answers with where it now lies, as `grid_view` says it. The change is `edit/trace.ts`, written
 * through `writeChange` as every change is; the picture's path is resolved from the project
 * folder and kept inside it, as `loadPlan` resolves it (CMD-15). It changes no part of the
 * building, so it comes after the site's tools and before the saved views.
 */
import { traceFloor } from '@ongrid/floorplan/geometry'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { placeTrace, type TraceRequest } from '../edit/trace'
import { PathRefused, PATH_MAX } from '../fs/projectFiles'
import { hasPictureEnding, readTrace } from '../trace/traceImage'
import { DECIMAL_IN_ARG, FLOOR_ARG, floorArg, PLAN_ARG, projectOf, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

type Pair = [number, number]

const POINT_MAX = 60
const LARGEST = 100_000

/** A point written `a,b`: pixels as plain numbers, plan points in metres or with their unit. */
function pointArg(name: string, text: string, lengths: boolean): Pair {
  const form = lengths ? 'x,y in plan metres, or with a unit (3.5,0 or 40ft,12ft)' : 'u,v in the picture\'s pixels from its top-left corner (212,148)'
  const parts = text.split(',').map((p) => p.trim())
  const one = (part: string): number => {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(part)) return Number(part)
    if (!lengths) throw new ToolRefusal(`${name} takes ${form}.`)
    try {
      return readLength(part)
    } catch (error) {
      if (error instanceof LengthRefused) throw new ToolRefusal(`${name} takes ${form}.`)
      throw error
    }
  }
  if (parts.length !== 2 || parts.some((p) => p === '')) throw new ToolRefusal(`${name} takes ${form}.`)
  const point: Pair = [one(parts[0]!), one(parts[1]!)]
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= LARGEST)) throw new ToolRefusal(`${name} takes points within ${LARGEST} of 0.`)
  return point
}

const TRACE_OUTPUT = {
  ...EDIT_OUTPUT,
  properties: {
    ...(EDIT_OUTPUT['properties'] as Record<string, unknown>),
    // The trace image as the plan now states it, and the line grid_view gives on it.
    referenceImage: { type: ['object', 'null'] },
    trace: STRING,
  },
}

export const placeTraceTool: GridTool = {
  name: 'grid_place_trace',
  title: 'Set, place, scale or turn the trace image under the plan',
  hint: 'change-plan',
  description:
    'Use this when the person gives a scan, photo, sketch or drawing sheet to trace over, or asks to move, scale, turn or line it up: "trace this scan", "the scale bar is 5 m long", "these two corners are 8.4 m apart", "the photo is upside down", "use page 2 of the PDF". '
    + 'path names the picture (a .png, .jpg or .jpeg, or a .pdf, whose page is traced by the scanned picture on it) inside the project folder; floor the floor it lies under; opacity how strongly it is drawn. '
    + 'Scale it one way: scale in metres per pixel; or calibrate_from and calibrate_to, two pixels on it, with length, how far apart they are on the building (a scale bar\'s two ends and the length marked on it); or pin_pixels with pin_points, two of its pixels and the two points of the plan they show, which sets its corner, turn and scale in one go and lines it up with walls already drawn. at places its top-left corner and rotation turns it about that corner, in degrees counter-clockwise. '
    + 'Pixels are u,v from the picture\'s top-left corner, v down; read them off the picture itself. Each call keeps what it does not give; remove takes the trace image out. '
    + 'It answers with where the picture now lies and how its pixel maps to the plan, as grid_view says. The trace image is drawn under the plan in grid_view, grid draw and the preview, and is in no measure, check or export. '
    + 'Do not use to draw walls or rooms from it (write rooms text from what you read on it), or for a phone room scan (grid write --scan). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    image: { type: 'string', maxLength: PATH_MAX, description: 'The picture to trace, as a path inside the project folder, ending in .png, .jpg, .jpeg or .pdf.', examples: ['assets/ground-floor-scan.png', 'sheets/survey.pdf'] },
    page: { type: 'number', minimum: 1, maximum: 100_000, description: 'For a PDF: the page to trace, from 1. The first when left out.', examples: [2] },
    floor: { ...FLOOR_ARG, description: 'The floor it lies under, by id. The lowest floor when never given.' },
    opacity: { type: 'number', minimum: 0, maximum: 1, description: 'How strongly it is drawn, from 0 to 1. 0.4 when never given.', examples: [0.5] },
    at: { type: 'string', maxLength: POINT_MAX, description: 'The point of the plan its top-left corner lies on, "x,y" in metres.', examples: ['-1.2,9.4'] },
    rotation: { type: 'number', minimum: -360, maximum: 360, description: 'Its turn about its top-left corner, in degrees counter-clockwise: 180 for a picture upside down.', examples: [0, 180, -90] },
    scale: { type: 'number', minimum: 1e-6, maximum: 100, description: 'Its scale in metres per pixel, when the person states it: 0.01 for one centimetre a pixel.', examples: [0.01] },
    calibrate_from: { type: 'string', maxLength: POINT_MAX, description: 'One end of a known length on the picture, "u,v" in its pixels: one end of the scale bar, or a corner of a wall whose length is written on it.', examples: ['212,148'] },
    calibrate_to: { type: 'string', maxLength: POINT_MAX, description: 'The other end, "u,v".', examples: ['1012,148'] },
    length: { type: 'number', length: true, minimum: 0.001, maximum: LARGEST, description: 'How far apart calibrate_from and calibrate_to are on the building: the length the scale bar is marked with, in metres or with its unit.', examples: [8.4] },
    pin_pixels: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 2, maxItems: 2, description: 'Two pixels on the picture, each "u,v", that show two points of the plan you know (two outside corners already drawn), as far apart as you can.', examples: [['212,148', '1012,610']] },
    pin_points: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 2, maxItems: 2, description: 'The two points of the plan, each "x,y" in metres, that pin_pixels show, in the same order.', examples: [['0,0', '8.4,-4.8']] },
    remove: { type: 'boolean', description: 'true to take the trace image out of the plan. The picture stays in the folder.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: TRACE_OUTPUT,
  run(args, context) {
    const given = (key: string): boolean => args[key] !== undefined
    const calibrating = ['calibrate_from', 'calibrate_to', 'length'].filter(given)
    if (calibrating.length > 0 && calibrating.length < 3) throw new ToolRefusal('Give calibrate_from, calibrate_to and length together: two pixels on the picture and how far apart they are on the building.')
    if (given('pin_pixels') !== given('pin_points')) throw new ToolRefusal('Give pin_pixels and pin_points together: two pixels and the two points of the plan they show.')
    const path = args['image'] as string | undefined
    if (path !== undefined) {
      // CMD-15: the picture is resolved from the project folder and must stay inside it.
      try {
        projectOf(context).resolve(path, 'project')
      } catch (error) {
        if (error instanceof PathRefused) throw new ToolRefusal(error.message)
        throw error
      }
      if (!hasPictureEnding(path)) throw new ToolRefusal(`image ${JSON.stringify(path)} does not end in .png, .jpg, .jpeg or .pdf: name a picture or a PDF inside the project folder.`)
    }
    const changed = writeChange(context, args, (_survey, _problems, stated) => {
      const request: TraceRequest = {
        ...(path === undefined ? {} : { path }),
        ...(given('page') ? { page: args['page'] as number } : {}),
        ...(given('floor') ? { floor: floorArg(stated, args['floor']) } : {}),
        ...(given('opacity') ? { opacity: args['opacity'] as number } : {}),
        ...(given('at') ? { at: pointArg('at', args['at'] as string, true) } : {}),
        ...(given('rotation') ? { rotation: args['rotation'] as number } : {}),
        ...(given('scale') ? { scale: args['scale'] as number } : {}),
        ...(calibrating.length === 3 ? { calibration: { from: pointArg('calibrate_from', args['calibrate_from'] as string, false), to: pointArg('calibrate_to', args['calibrate_to'] as string, false), length: args['length'] as number } } : {}),
        ...(given('pin_pixels')
          ? {
              pins: {
                pixels: (args['pin_pixels'] as string[]).map((p) => pointArg('pin_pixels', p, false)) as [Pair, Pair],
                points: (args['pin_points'] as string[]).map((p) => pointArg('pin_points', p, true)) as [Pair, Pair],
              },
            }
          : {}),
        ...(args['remove'] === true ? { remove: true } : {}),
      }
      return placeTrace(stated, request)
    })
    // Where it now lies, as grid_view says it.
    const { project, loaded } = readPlan(context, changed.data['written'])
    const image = loaded.plan.referenceImage ?? null
    const line = image === null ? null : readTrace(project, loaded.plan, traceFloor(loaded.plan).floor).line
    return {
      text: [changed.text, ...(line === null ? [] : [line])].join('\n'),
      data: { ...changed.data, referenceImage: image, ...(line === null ? {} : { trace: line }) },
    }
  },
}
