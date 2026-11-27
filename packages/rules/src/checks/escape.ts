/**
 * The escape-opening check: a bedroom needs a window or a door to the outside that
 * someone can climb through.
 *
 * Reads `Room.use` and `Wall.kind` as declared and never guesses either. A window is
 * measured by the part of it that opens when the plan states one (CNT-14, `opens`), and a fixed
 * window opens nothing; otherwise it is measured as drawn, so a note says "as drawn", and a
 * window that opens only in part needs a bigger frame than these figures.
 */

import { indexPlan, overFigure, partHeight, partWidth, roomZones, rounded, shownAgainst, statedKind, underFigure, type FloorPlan, type Opening } from '@ongrid/floorplan/geometry'
import { openingSides, outsideTest, roomOutlines } from '@ongrid/floorplan/geometry/rules/graph'
import { outdoorIds } from '@ongrid/floorplan/geometry/outdoor'
import { RULE_USES } from './catalogue'
import type { FloorScope } from './coverage'
import { ESCAPE_TOP_LEVEL } from './figures'
import { messages } from './messages'
import type { AppliedFigure, RuleFinding, WholeRoom } from './types'
import { appliedUse, type AppliedUse } from './zoned'

/**
 * The uses this check covers, as its coverage lists them (CNT-5's `uses`). CNT-8: a room with a
 * sleeping zone is one someone sleeps in.
 */
const COVERS = RULE_USES['escape-opening']

/** The figures of the check. One that is `null` is not tested. */
export interface EscapeFigures {
  readonly minArea: AppliedFigure | null
  /** For an opening on the ground floor. Falls back to `minArea`. */
  readonly minAreaGrade: AppliedFigure | null
  readonly minWidth: AppliedFigure | null
  readonly minHeight: AppliedFigure | null
  readonly maxSill: AppliedFigure | null
}

/** Whether there is anything to test a window against. */
export const hasEscapeFigures = (figures: EscapeFigures): boolean => Object.values(figures).some((f) => f !== null)

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Measured {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly sill: number
  readonly area: number
}

/**
 * A window as drawn, compared as it is and never rounded first (ARE-7): the part of it that opens
 * when the plan states one, and nothing for a fixed window (CNT-14). The part opens from the sill.
 */
const measure = (opening: Opening): Measured => {
  const fixed = opening.type === 'window' && statedKind(opening.type, opening.kind) === 'fixed'
  const width = fixed ? 0 : partWidth(opening.width, opening.opens)
  const height = fixed ? 0 : partHeight(opening.height, opening.opens)
  return { id: opening.id, width, height, sill: opening.sill, area: width * height }
}

/**
 * What a finding carries: lengths to the millimetre and areas to 0.01 m², or to the digits
 * that keep each on its side of the figure it was checked against, so a note shows what was
 * compared and never hides a shortfall.
 */
const length = (value: number, figure: AppliedFigure | null): number =>
  figure === null ? rounded(value, 3) : shownAgainst(value, figure.value, 3, 'm')
const surface = (value: number, figure: AppliedFigure | null): number =>
  figure === null ? rounded(value, 2) : shownAgainst(value, figure.value, 2, 'm²')

/** Largest by area, then by id: the window a note describes. */
const largest = (windows: readonly Measured[]): Measured =>
  [...windows].sort((a, b) => b.area - a.area || byText(a.id, b.id))[0]!

const present = (figures: readonly (AppliedFigure | null)[]): AppliedFigure[] =>
  figures.filter((f): f is AppliedFigure => f !== null)

export function escapeCheck(
  storey: FloorPlan,
  leftOut: ReadonlySet<string>,
  floor: string,
  level: number,
  roomName: (id: string) => string,
  figures: EscapeFigures,
  /**
   * Whether the floor is the ground floor (LVL-4, `groundLevel`): the floor at level 0, or, with
   * the site's ground level stated, the floor nearest it. Its windows take the figure for a floor
   * at grade where one is carried. Unstated, the floor at level 0.
   */
  atGround: boolean = level === 0,
  /** Openings reported as below ground by the drawing check. */
  belowGround: ReadonlySet<string> = new Set()
): { findings: RuleFinding[]; scope: FloorScope; wholeRooms: WholeRoom[] } {
  const index = indexPlan(storey)
  const outlines = roomOutlines(storey, index, leftOut)
  const zones = roomZones(index)
  // MSG-2: every room of the floor is looked at or skipped, with the reason. Only bedrooms are
  // looked at; a room with no use stated may be one, so it is said apart. CNT-8: a room with a
  // zone that is a bedroom is looked at as a whole, through every outside wall it has, and a
  // zone is looked at as part of its room.
  const above = level > ESCAPE_TOP_LEVEL.level
  const scope: FloorScope = { lookedAt: [], skipped: { cannot_be_drawn: [], no_use: [], use_not_covered: [], above_escape_storeys: [] } }
  const applied = new Map<string, AppliedUse>()
  const wholeRooms: WholeRoom[] = []
  for (const room of storey.rooms) {
    const use = appliedUse(room, storey.rooms, zones, COVERS)
    applied.set(room.id, use)
    const reason = !outlines.has(room.id)
      ? 'cannot_be_drawn'
      : use.kind === 'zone'
        ? 'part_of_room'
        : use.kind === 'no_use'
          ? 'no_use'
          : use.kind === 'not_covered'
            ? 'use_not_covered'
            : above
              ? 'above_escape_storeys'
              : null
    if (reason === null) scope.lookedAt.push(room.id)
    else (scope.skipped[reason] ??= []).push(room.id)
    if (reason === null && use.kind === 'checked' && zones.zones.has(room.id)) wholeRooms.push({ floor, room: room.id, use: use.use, zone: use.zone })
  }
  // Above the third storey the figures here stop: the bedrooms are said to be not checked (CH-4).
  if (above || !hasEscapeFigures(figures)) return { findings: [], scope, wholeRooms }

  const minArea = atGround ? (figures.minAreaGrade ?? figures.minArea) : figures.minArea
  const { minWidth, minHeight, maxSill } = figures
  const bigEnough = (w: Measured): boolean =>
    (minWidth === null || !underFigure(w.width, minWidth.value, 'm')) &&
    (minHeight === null || !underFigure(w.height, minHeight.value, 'm')) &&
    (minArea === null || !underFigure(w.area, minArea.value, 'm²'))
  const lowEnough = (w: Measured): boolean => maxSill === null || !overFigure(w.sill, maxSill.value, 'm')

  // Windows and doors to the outside, by the rooms on their sides: on a wall stated exterior, or
  // with a room on one side only and no enclosed floor on the other (MSG-13, `outsideTest`).
  const outside = new Map<string, Opening[]>()
  const leftOutBelow = new Map<string, string[]>()
  const facesOutside = outsideTest(storey, index)
  const outdoor = outdoorIds(storey)
  for (const opening of storey.openings) {
    if (opening.type === 'opening') continue
    const wall = index.wallsById.get(opening.wall)
    if (wall === undefined) continue
    const [left, right] = openingSides(opening, index, outlines)
    const along = opening.offset + opening.width / 2
    // CNT-7 (C26): an outdoor space beyond the opening is the open air.
    const rooms =
      wall.kind === 'exterior'
        ? [left, right]
        : right !== null && outdoor.has(right)
          ? [left]
          : left !== null && outdoor.has(left)
            ? [right]
            : left !== null && right === null && facesOutside(wall, along, 'right')
          ? [left]
          : right !== null && left === null && facesOutside(wall, along, 'left')
            ? [right]
            : []
    for (const side of new Set(rooms)) {
      if (side === null) continue
      if (belowGround.has(opening.id)) {
        leftOutBelow.set(side, [...(leftOutBelow.get(side) ?? []), opening.id])
        continue
      }
      const list = outside.get(side)
      if (list) list.push(opening)
      else outside.set(side, [opening])
    }
  }

  const findings: RuleFinding[] = []
  for (const room of storey.rooms) {
    const use = applied.get(room.id)!
    if (use.kind !== 'checked' || !outlines.has(room.id)) continue
    const openings = outside.get(room.id) ?? []
    // A door straight outside is enough.
    if (openings.some((o) => o.type === 'door')) continue

    const windows = openings.map(measure)
    if (windows.some((w) => bigEnough(w) && lowEnough(w))) continue

    // CNT-8: a room with zones says which use the check applied, and the zone it read it from.
    const whole = zones.zones.has(room.id) ? { use: use.use, ...(use.zone === null ? {} : { zone: use.zone }) } : {}
    const base = { ruleId: 'escape-opening', floor, rooms: use.zone === null ? [room.id] : [room.id, use.zone], ...whole }
    if (windows.length === 0) {
      const below = [...(leftOutBelow.get(room.id) ?? [])].sort(byText)
      findings.push({
        ...base,
        code: 'no_escape_opening',
        openings: below,
        message: below.length === 0 ? messages.noEscapeOpening(roomName(room.id)) : messages.noEscapeOpeningBelowGround(roomName(room.id))
      })
      continue
    }
    const sized = windows.filter(bigEnough)
    if (sized.length > 0 && maxSill !== null) {
      const w = largest(sized)
      findings.push({
        ...base,
        code: 'escape_window_too_high',
        openings: [w.id],
        message: messages.escapeWindowTooHigh(roomName(room.id)),
        sill: length(w.sill, maxSill),
        maximum: maxSill.value,
        figures: [maxSill]
      })
      continue
    }
    const w = largest(windows)
    findings.push({
      ...base,
      code: 'escape_window_too_small',
      openings: [w.id],
      message: messages.escapeWindowTooSmall(roomName(room.id)),
      area: surface(w.area, minArea),
      ...(minArea === null ? {} : { minimum: minArea.value }),
      width: length(w.width, minWidth),
      height: length(w.height, minHeight),
      figures: present([minArea, minWidth, minHeight])
    })
  }
  return { findings, scope, wholeRooms }
}
