/**
 * COD-8: the drawing measured for each of the firm's standards, by the measures Grid already
 * has. Where CNT-17's accessibility numbers measure the same thing, the same measure: a
 * corridor's narrowest point from end to end (`corridorEnds`), a doorway's clear width and a
 * room's turning space (CNT-13's `doorwayClearance` and `turningSpace`, as CNT-17 reads them).
 * Then CNT-13's floor in front of a fixture (`quantities/use.ts` and the library's `use.ts`),
 * ARE-9's net area (`planAreas`) and the widest circle an empty room holds (`measureRoom`). The
 * firm's figures go to the front door (`inspectPlan`'s `firm`), which says which parts are short
 * of them, under their own heading.
 *
 * Pure but for `firmForCheck`, which reads the firm's file beside the plan through the project.
 */
import { doorwayClearance, fixtureSpace, itemKindDefinition, itemNameSaid, turningSpace, type FloorPlan, type Item, type Vec2 } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said, type Said, type Value } from '@ongrid/floorplan/messages'
import type { FirmInput, FirmMeasured, FirmStandard } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { planAreas } from '../quantities/areas'
import { measureRoom } from '../quantities/measure'
import { surveyPlan, type Survey, type SurveyRoom } from '../quantities/survey'
import { corridorEnds } from '../quantities/access'
import { fixturesOf } from '../quantities/use'
import { activityZones, type ZoneFigure } from '../quantities/activity'
import { readFirm } from './standards'

/** MSG-11: where a part was measured, by key (`line.part.firm.*`), with its English as `said`. */
const where = (sentence: Said): { said: string; sentence: Said } => ({ said: english(sentence), sentence })
const fig = (value: number): Value => num(value.toFixed(2))
const point = (p: Vec2): Said => said('line.part.firm.point', { x: fig(p.x), y: fig(p.y) })
const itemsNamed = (items: readonly Item[], ids: readonly string[]): Value => joined(items.filter((item) => ids.includes(item.id)).map(itemNameSaid), 'join.comma')
/** What a way through runs beside, as `besideText` (`quantities/use.ts`) says it. */
function besideSaid(passage: { beside: { fixtures: readonly string[]; wall: boolean } }, items: readonly Item[]): Value {
  const named = items.some((item) => passage.beside.fixtures.includes(item.id))
  if (!named) return passage.beside.wall ? said('line.part.firm.at.betweenWalls') : ''
  const fixtures = itemsNamed(items, passage.beside.fixtures)
  return passage.beside.wall ? said('line.part.firm.at.betweenFixtures', { fixtures }) : said('line.part.firm.at.beside', { fixtures })
}

/** The rooms a room standard is for: its uses, else every room (for a corridor width, the rooms used as corridor). Zones are part of a room, and not measured on their own. */
function roomsFor(survey: Survey, standard: FirmStandard): SurveyRoom[] {
  const uses = standard.uses.length > 0 ? standard.uses : standard.measure === 'corridor_width' ? ['corridor'] : null
  return survey.rooms.filter((room) => room.polygon.length >= 3 && room.facts.zoneOf === undefined && (uses === null || (room.facts.use !== undefined && uses.includes(room.facts.use))))
}

/**
 * A corridor's width: CNT-17's narrowest point from end to end (`corridorEnds`, CNT-13's way
 * through a room between the corridor's two ends), so the firm's figure and the accessibility
 * numbers read the same measure; the widest circle it holds when Grid finds no two ends.
 */
function corridorWay(survey: Survey, room: SurveyRoom, i: number): FirmMeasured {
  const { items, obstacles } = fixturesOf(survey)
  const { way, widest } = corridorEnds(room, obstacles(room.facts.floor))
  const base = { standard: i, thing: { kind: 'room', id: room.facts.id } as const, floor: room.facts.floor }
  if (way === null) return { ...base, measured: widest, precision: 0, ...where(said('line.part.firm.at.noEnds')), also: [] }
  const beside = way.atDoorway ? '' : besideSaid(way, items)
  return { ...base, measured: way.width, precision: way.step, ...where(said('line.part.firm.at.corridor', { at: point(way.at), beside })), also: [...way.beside.fixtures] }
}

/** Every part each standard looks at, measured. */
export function firmMeasures(plan: FloorPlan, standards: readonly FirmStandard[]): FirmMeasured[] {
  if (standards.length === 0) return []
  const survey = surveyPlan(plan)
  const out: FirmMeasured[] = []
  const net = new Map<string, number | null>()
  if (standards.some((s) => s.measure === 'room_area')) for (const floor of planAreas(survey).floors) for (const room of floor.rooms) net.set(room.id, room.net)
  standards.forEach((standard, i) => {
    switch (standard.measure) {
      case 'corridor_width':
        for (const room of roomsFor(survey, standard)) out.push(corridorWay(survey, room, i))
        return
      case 'turning_circle': {
        const { rows, obstacles } = fixturesOf(survey)
        for (const room of roomsFor(survey, standard)) {
          const circle = turningSpace(room.polygon, room.holes, obstacles(room.facts.floor))
          const own = rows.filter((row) => row.room === room.facts.id).length
          const clear = own === 0 ? said('line.part.firm.at.noFixtures') : own === 1 ? said('line.part.firm.at.clearOne') : said('line.part.firm.at.clearMany', { count: own })
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: circle.diameter, precision: 0, ...where(said('line.part.firm.at.turning', { at: point(circle.at), clear })), also: [] })
        }
        return
      }
      case 'room_width':
        for (const room of roomsFor(survey, standard)) {
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: measureRoom(room).widestCircle, precision: 0, ...where(said('line.part.firm.at.width')), also: [] })
        }
        return
      case 'room_area':
        for (const room of roomsFor(survey, standard)) {
          const area = net.get(room.facts.id)
          if (area === undefined || area === null) continue
          out.push({ standard: i, thing: { kind: 'room', id: room.facts.id }, floor: room.facts.floor, measured: area, precision: 0, ...where(said('line.part.firm.at.area')), also: [] })
        }
        return
      case 'door_clear_width': {
        const { items, obstacles } = fixturesOf(survey)
        for (const floor of survey.facts.floors) {
          for (const facts of floor.openings) {
            if (facts.type === 'window') continue
            const opening = plan.openings.find((o) => o.id === facts.id)
            const wall = plan.walls.find((w) => w.id === facts.wall)
            if (!opening || !wall || wall.virtual === true) continue
            // LVL-5: the floor the door stands on, as CNT-17 reads it; a wall through floors stands on more than its own.
            const d = doorwayClearance(wall, opening, obstacles(facts.floor))
            const leaf = d.leaf > 0 ? said('line.part.firm.at.leaf', { leaf: fig(d.leaf) }) : ''
            const count = items.filter((item) => d.narrowedBy.includes(item.id)).length
            const narrowed = count === 0 ? '' : said(count === 1 ? 'line.part.firm.at.narrowed.one' : 'line.part.firm.at.narrowed.many', { names: itemsNamed(items, d.narrowedBy), covered: fig(d.covered) })
            out.push({ standard: i, thing: { kind: 'opening', id: opening.id }, floor: facts.floor, measured: d.clear, precision: 0, ...where(said('line.part.firm.at.door', { hole: fig(d.hole), leaf, narrowed })), also: [...d.narrowedBy] })
          }
        }
        return
      }
      case 'fixture_clearance': {
        if (standard.width !== undefined) {
          // ARE-73: the zone on each fixture's centre line, as wide as the firm's width and as deep as its figure.
          const width = standard.width
          const wanted = (item: Item): ZoneFigure | null =>
            standard.kinds.length > 0 && !standard.kinds.includes(item.kind) ? null : itemKindDefinition(item.kind)?.group === 'fixture' || standard.kinds.includes(item.kind) ? { front: standard.value, width, from: 'person', widthGiven: true } : null
          const clearOr = (v: number | null): Value => (v === null ? said('activity.open') : said('line.part.firm.at.zoneSide', { value: fig(v) }))
          for (const zone of activityZones(survey, {}, wanted).zones) {
            const room = survey.byId.get(zone.room)!
            const at = said('line.part.firm.at.zone', { room: name(room.facts.name), width: fig(width), left: clearOr(zone.measured.left), leftWay: said(`describe.way.${zone.ways.left}`), right: clearOr(zone.measured.right), rightWay: said(`describe.way.${zone.ways.right}`) })
            out.push({ standard: i, thing: { kind: 'item', id: zone.items[0]! }, floor: zone.floor, measured: zone.band, precision: 0, ...where(at), also: [room.facts.id, ...zone.items.slice(1)] })
          }
          return
        }
        const { rows, items, obstacles } = fixturesOf(survey)
        for (const row of rows) {
          if (standard.kinds.length > 0 && !standard.kinds.includes(row.kind)) continue
          const room = row.room === null ? undefined : survey.byId.get(row.room)
          const item = items.find((it) => it.id === row.id)
          if (room === undefined || room.polygon.length < 3 || item === undefined) continue
          const front = fixtureSpace(item, room.polygon, room.holes, obstacles(row.floor)).front
          // Nothing in front of it bounds the floor: it is open, so never short.
          if (front === null) continue
          out.push({ standard: i, thing: { kind: 'item', id: row.id }, floor: row.floor, measured: front, precision: 0, ...where(said('line.part.firm.at.fixture', { room: name(room.facts.name) })), also: [room.facts.id] })
        }
        return
      }
    }
  })
  return out
}

/**
 * The firm's standards beside the plan, measured on it, for the check; undefined when the plan
 * has no firm's file beside it, so a plan without one is checked exactly as before.
 */
export function firmForCheck(project: Project, planFile: string, plan: FloorPlan): FirmInput | undefined {
  const read = readFirm(project, planFile)
  if (read === null) return undefined
  return { file: read.file, problem: read.problem, standards: read.standards, measured: read.problem === null ? firmMeasures(plan, read.standards) : [] }
}
