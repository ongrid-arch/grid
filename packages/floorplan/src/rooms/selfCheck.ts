/**
 * WRT-17: the plan rooms text writes, checked as `grid check` will check it, before it is written.
 *
 * The writer works the walls out itself, so the check should find nothing to say about them. What
 * it would still find is not left for the person to meet afterwards: an error the check finds on
 * a part the writer worked out (a part it would leave out) refuses the writing, in the check's own
 * words; floor the rooms close round that no room claims is said with where it is and how to
 * write it; and every other note the writer has not said already is said in its answer. A part
 * written raw is the person's own, kept as written: what the check finds on it is said, not
 * refused. Pure: a plan in, problems and warnings out.
 */
import { floorSpaces, spacesKnown } from '../geometry/spaces'
import { tolerance } from '../geometry/tolerances'
import { validatePlan } from '../geometry/validate'
import { english, said } from '../messages/say'
import { floorOf } from '../geometry/floors'
import { safeParseFloorPlan, type FloorPlan } from '../types/floorplan'
import { f2 } from './words'

interface Said {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

/** The check's notes the writer says in words of its own, with the writer's code for each. */
const SAID_BY_THE_WRITER: Readonly<Record<string, string>> = {
  'opening/window-between-rooms': 'rooms/inside-window',
  // LVL-21: a stair line says an end in no room with its line.
  'stair/end-in-no-room': 'rooms/stair-end',
}

/** The floors of the plan, as its rooms name them. */
const floorsOf = (plan: FloorPlan): string[] => [...new Set(plan.rooms.map((room) => floorOf(room)))]

/** Floor the rooms close round that no room claims, where it is and the rooms round it. */
function holes(plan: FloorPlan): Said[] {
  const found: Said[] = []
  for (const floor of floorsOf(plan)) {
    const result = floorSpaces(plan, floor)
    if (!spacesKnown(result)) continue
    for (const piece of result.unclaimed) {
      if (piece.area < tolerance('areaReported')) continue
      const around = new Set(piece.walls)
      const rooms = plan.rooms.filter((room) => floorOf(room) === floor && room.boundary.some((id) => around.has(id))).map((room) => `'${room.id}'`)
      found.push({
        code: 'rooms/hole',
        line: null,
        message: english(
          said('rooms.hole', {
            floor,
            area: f2(piece.area),
            at: `(${f2(piece.at.x)}, ${f2(piece.at.y)})`,
            rooms: rooms.length > 0 ? rooms.join(', ') : [...around].map((id) => `'${id}'`).join(', '),
          })
        ),
      })
    }
  }
  return found
}

export function checkWritten(written: unknown, warned: readonly Said[], raw: ReadonlySet<string>): { problems: Said[]; warnings: Said[] } {
  const problems: Said[] = []
  const warnings: Said[] = []
  const plan = safeParseFloorPlan(written)
  if (plan === null) return { problems, warnings }
  warnings.push(...holes(plan))
  const already = new Set(warned.map((w) => w.code))
  for (const found of validatePlan(plan).issues) {
    if (found.code === 'floor/unclaimed') continue
    if (found.severity === 'error' && !raw.has(found.id)) {
      problems.push({ code: 'rooms/check', line: null, message: english(said('rooms.checkError', { code: found.code, message: found.message })) })
      continue
    }
    const own = SAID_BY_THE_WRITER[found.code]
    if (own !== undefined && already.has(own)) continue
    warnings.push({ code: 'rooms/check', line: null, message: english(said('rooms.checkNote', { code: found.code, message: found.message })) })
  }
  return { problems, warnings }
}
