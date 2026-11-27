/**
 * Which rooms get the sun, as a table (BRF-5), in words and as data: for each room, the way each
 * window wall faces, the window area against the floor area and the room's depth from each
 * window wall. The geometry is `planSunTable` in the core; this only words it.
 *
 * Every line of the table starts "Geometry," because that is all it is: no line says how much
 * daylight or sun a room gets. The north the directions are from comes first, and a plan that
 * states no north is answered with north as the top of the drawing, said before anything else.
 */
import { planSunTable, type FloorPlan, type SunRoom, type SunWall } from '@ongrid/floorplan/geometry'
import type { Display } from '@ongrid/floorplan/types/units'
import { northData, northLine } from './facing'
import { areaText, lengthText } from './units'
import { roomCalled } from './survey'

export const SUN_RULE =
  'This is geometry, not a daylight or sunlight result: Grid works out no sun path, shade, sky, glass or reflection, and checks no rule. '
  + 'A window wall is a stretch of outside wall with a window in it, and it faces the way of its outside face, turned by the plan\'s north. '
  + 'A window\'s area is its hole in the wall, width by height, with no frame taken off; a door counts with the windows only when its type is glazed, and a doorless opening never. '
  + 'The floor area is the room\'s net area inside its wall faces. '
  + 'The depth from a window wall is the distance, square to that wall, from its inside face to the farthest point of the room\'s floor.'

/** The table's title line, after the north. */
export const SUN_TITLE =
  'Geometry, not a daylight result: each room\'s window walls, the way each faces, the window area against the floor area, and how deep the room runs from each window wall.'

const q = (text: string): string => JSON.stringify(text)
const deg = (value: number): number => Math.round(value * 10) / 10 + 0
/** Rounded half up on the figure as written: 0.42 / 4.8 is 0.0875, not the 0.08749… a float holds. */
const settle = (value: number): number => Math.round(Number(value.toPrecision(12)))
const round = (value: number): number => settle(value * 1000) / 1000 + 0
const percent = (ratio: number): string => `${(settle(ratio * 1000) / 10 + 0).toFixed(1)}%`

export interface SunAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

/**
 * The table of every room, or of one. `room` is a room id the caller has checked; a room whose
 * outline does not close is not in the table, and `missing` says so for the one asked for.
 */
export function sunAnswer(plan: FloorPlan, display: Display, room?: string): SunAnswer & { missing: boolean } {
  const table = planSunTable(plan)
  const name = new Map(plan.rooms.map((r) => [r.id, roomCalled(r)]))
  const rooms = table.rooms.filter((r) => room === undefined || r.room === room)
  const L = (v: number): string => lengthText(v, display)
  const A = (v: number): string => areaText(v, display)
  const stated = table.facing.northStated
  const label = (r: SunRoom): string => `${q(name.get(r.room) ?? r.room)} (${q(r.room)})`

  const wallLine = (r: SunRoom, w: SunWall): string => {
    const windows = w.windows.map((o) => `${q(o.id)}${o.door ? ' (glazed door)' : ''} ${L(o.width)} wide × ${L(o.height)} high, ${A(o.area)}`).join('; ')
    const way = stated ? `faces ${w.faces}` : `faces ${w.faces} if the top of the drawing is north`
    return `Geometry, ${label(r)}, window wall ${q(w.wall)}: ${way} (bearing ${deg(w.bearing)}°); windows ${windows}; the room runs ${L(w.depth)} deep from its inside face.`
  }
  const lines = [northLine(table.facing), SUN_TITLE]
  if (rooms.length === 0) lines.push('Geometry: no room has an outline Grid can measure.')
  for (const r of rooms) {
    if (r.walls.length === 0) {
      lines.push(`Geometry, ${label(r)}: floor ${A(r.floorArea)}, no window in an outside wall.`)
      continue
    }
    const ratio = r.windowToFloor === null ? 'the room has no floor area to set them against' : `${percent(r.windowToFloor)} of the floor area`
    const walls = r.walls.length === 1 ? '1 window wall' : `${r.walls.length} window walls`
    lines.push(`Geometry, ${label(r)}: floor ${A(r.floorArea)}, windows ${A(r.windowArea)}, ${ratio}, in ${walls}.`)
    for (const w of r.walls) lines.push(wallLine(r, w))
  }

  const data = {
    measures: 'geometry, not a daylight result',
    ...northData(table.facing),
    rooms: rooms.map((r) => ({
      id: r.room,
      name: name.get(r.room) ?? r.room,
      floor: r.floor,
      floorArea: round(r.floorArea),
      windowArea: round(r.windowArea),
      windowToFloor: r.windowToFloor === null ? null : round(r.windowToFloor),
      windowWalls: r.walls.map((w) => ({
        wall: w.wall,
        from: round(w.from),
        to: round(w.to),
        faces: w.faces,
        bearing: deg(w.bearing),
        windows: w.windows.map((o) => ({ id: o.id, width: round(o.width), height: round(o.height), area: round(o.area), ...(o.door && { door: true }) })),
        windowArea: round(w.windowArea),
        depth: round(w.depth),
      })),
    })),
  }
  return { lines, data, missing: room !== undefined && rooms.length === 0 }
}
