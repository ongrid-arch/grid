/**
 * CNT-58: the arguments that ask about the sun, written once for `grid_measure what=sun`,
 * `grid_view` and `grid_export`, and read into the core's moments. A date or time that cannot be
 * read is refused with how to write it.
 */
import { daysBetween, planSunAt, type FloorPlan, type PlanSun, type SunArea } from '@ongrid/floorplan/geometry'
import { placeOf, readDay, readHours, readMoment, readOffset, readTime, SunAskRefused, type SunPathAsk } from '../quantities/sunPath'
import { ToolRefusal, type ArgSpec, type ArgSpecs } from './toolkit'

/** A refusal of the sun's reading as the tool's own. */
export function sunArg<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof SunAskRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

const AREAS_MOST = 50
const AREA_POINTS_MOST = 200

/** `areas`: patches to measure in sun, by name, each its corners in plan metres. */
const AREAS_ARG: ArgSpec = {
  type: 'object',
  description: 'For sun with a date: patches of ground to measure in sun as well as the open outdoor spaces, paving and pools, each by its name with its corners, x and y in metres on the plan, in order round it: a planting bed, a lawn, a play area. Nothing is drawn or written into the plan.',
  examples: [{ 'vegetable bed': [[2, 1], [6, 1], [6, 2.2], [2, 2.2]] }],
  schema: {
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, minItems: 3, maxItems: AREA_POINTS_MOST },
    minProperties: 1,
    maxProperties: AREAS_MOST,
  },
  read: (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal('areas takes an object: each patch\'s name with its corners, such as {"bed": [[2, 1], [6, 1], [6, 2.2], [2, 2.2]]}.')
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0 || entries.length > AREAS_MOST) throw new ToolRefusal(`areas takes 1 to ${AREAS_MOST} patches.`)
    return entries.map(([name, points]): SunArea => {
      const ok = Array.isArray(points) && points.length >= 3 && points.length <= AREA_POINTS_MOST && points.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))
      if (!ok || name.trim() === '' || name.length > 120) throw new ToolRefusal(`areas: ${JSON.stringify(name.slice(0, 40))} takes 3 to ${AREA_POINTS_MOST} corners, each [x, y] in metres.`)
      return { name, points: (points as [number, number][]).map(([x, y]) => ({ x, y })) }
    })
  },
}

/** The arguments `grid_measure what=sun` takes beyond `room`. */
export const SUN_MEASURE_ARGS: ArgSpecs = {
  date: { type: 'string', maxLength: 12, description: 'For sun: the day to work the sun out on, YYYY-MM-DD: where it is at time, or over hours, the faces it is on and the share of each open space in sun. Needs the site\'s latitude and longitude. Left out, sun gives the table of window walls alone.', examples: ['2026-06-21', '2026-12-21'] },
  until: { type: 'string', maxLength: 12, description: 'For sun, with date: the last day of a range of dates, worked out every 7 days and on the last.', examples: ['2026-09-21'] },
  time: { type: 'string', maxLength: 8, description: 'For sun, with date: one time of day, HH:MM, solar time unless utc_offset is given. Not with hours.', examples: ['12:00', '18:30'] },
  hours: { type: 'string', maxLength: 16, description: 'For sun, with date: a range of times, HH:MM-HH:MM, worked out every 30 minutes and at the last, for the hours of sun on each face and each space\'s share in sun weighted by time. Not with time.', examples: ['09:00-17:00'] },
  utc_offset: { type: 'number', description: 'For sun and the sun of grid_view: the clock\'s offset from UTC in hours (2 for central European summer time, -5 for US eastern standard time), so times are read and given as the clock\'s. Left out, times are the site\'s local solar time, 12:00 when the sun is highest.', examples: [2, -5], minimum: -12, maximum: 14 },
  areas: AREAS_ARG,
}

/** The argument `grid_view` (plan, 3d and eye) and `grid_export` take: one moment. */
export const SUN_VIEW_ARG: ArgSpec = {
  type: 'string',
  maxLength: 40,
  description: 'A moment to work the sun out at, "YYYY-MM-DD HH:MM" in the site\'s solar time (12:00 is when the sun is highest), or with the clock\'s offset from UTC after it ("2026-06-21 18:30 +02:00"). Needs the site\'s latitude and longitude. For plan: the shadows cast on the ground, or on the floor drawn\'s open spaces, shaded on the drawing; for 3d and eye: the model lit from the sun then; for grid_export of a glb: a light named sun shining that way.',
  examples: ['2026-06-21 12:00', '2026-10-15 18:30 +02:00'],
}

/** What `grid_measure what=sun` was asked, or null for the table of window walls alone. */
export function sunPathAsk(args: Readonly<Record<string, unknown>>): SunPathAsk | null {
  const named = (['until', 'time', 'hours', 'utc_offset', 'areas'] as const).filter((key) => args[key] !== undefined)
  if (args['date'] === undefined) {
    if (named.length > 0) throw new ToolRefusal(`what=sun takes ${named.join(', ')} with date: the day to work the sun out on, YYYY-MM-DD.`)
    return null
  }
  if (args['room'] !== undefined) throw new ToolRefusal('what=sun with a date works out the sun over the whole plan: leave room out, or leave date out for that room\'s window walls.')
  if (args['time'] !== undefined && args['hours'] !== undefined) throw new ToolRefusal('Pass time or hours, not both: one moment, or a range of times.')
  return sunArg(() => {
    const from = readDay(args['date'] as string, 'date')
    const until = args['until'] === undefined ? null : readDay(args['until'] as string, 'until')
    if (until !== null && daysBetween(from, until) < 0) throw new SunAskRefused('until is before date: give the first day as date and the last as until.')
    return {
      from,
      until,
      time: args['time'] === undefined ? null : readTime(args['time'] as string, 'time'),
      hours: args['hours'] === undefined ? null : readHours(args['hours'] as string, 'hours'),
      utcOffset: args['utc_offset'] === undefined ? null : readOffset(args['utc_offset'] as number, 'utc_offset'),
      areas: (args['areas'] as readonly SunArea[] | undefined) ?? [],
    }
  })
}

/** The sun of a `sun` argument over the plan, or null when none was passed. */
export function sunOfArg(plan: FloorPlan, value: unknown, offset?: unknown): PlanSun | null {
  if (value === undefined) return null
  return sunArg(() => {
    const ask = readMoment(String(value), 'sun', typeof offset === 'number' ? readOffset(offset, 'utc_offset') : null)
    return planSunAt(plan, placeOf(plan), ask.moment, ask.utcOffset)
  })
}

