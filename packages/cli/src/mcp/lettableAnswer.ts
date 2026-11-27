/**
 * ARE-68: what `grid_areas` and `grid_compare` add for the lettable area, the core, efficiency and
 * the area per person, as data and as lines, and each room's area as written (to its walls'
 * centre lines) when asked. The figures are `quantities/lettable.ts`'s; the words the message files'.
 */
import { ENGLISH_SPEAKER, joined, said, type Said, type Speaker } from '@ongrid/floorplan/messages'
import { toWallMiddles } from '@ongrid/floorplan/geometry/partyWalls'
import type { Wall } from '@ongrid/floorplan/geometry'
import { lettableFigures, lettableRules, peopleRatios, PERSON_WORD, type LettableChoice, type LettableFigures, type PeopleFigures, type PeopleRatio } from '../quantities/lettable'
import type { FloorAreas, PlanAreas } from '../quantities/areas'
import { planSeating } from '../quantities/seats'
import { stateText } from '../quantities/state'
import type { Survey } from '../quantities/survey'
import { areaText } from '../quantities/units'
import type { Display } from '@ongrid/floorplan/types/units'

/** MSG-34: a share in the speaker's language and decimal mark. */
const percent = (share: number | null, s: Speaker = ENGLISH_SPEAKER): string => (share === null ? s.say('sheet.notKnown') : s.figure(`${(share * 100).toFixed(1)}%`))

export interface LettableAsk {
  readonly choice?: LettableChoice
  readonly people?: PeopleFigures
  readonly brief?: PeopleFigures
}

export interface LettableAnswer {
  readonly lettable: LettableFigures
  readonly people: readonly PeopleRatio[]
}

/** The figures, from the areas already measured. */
export function lettableAnswer(survey: Survey, areas: PlanAreas, ask: LettableAsk): LettableAnswer {
  const lettable = lettableFigures(areas, ask.choice)
  const people = peopleRatios(areas, lettable, { ...(ask.people ? { asked: ask.people } : {}), ...(ask.brief ? { brief: ask.brief } : {}) }, planSeating(survey).plan)
  return { lettable, people }
}

/** A floor's lettable area and core, after its line in `grid_areas`. */
export function lettableFloorText(answer: LettableAnswer, floor: string, units: Display, s: Speaker = ENGLISH_SPEAKER): string {
  const f = answer.lettable.floors.find((row) => row.floor === floor)
  // A floor with nothing lettable and no core, such as massing, says nothing of either.
  if (f === undefined || (f.lettable === 0 && f.core === 0)) return ''
  return s.say('lettable.floor', { area: areaText(f.lettable, units), efficiency: percent(f.efficiency, s), core: areaText(f.core, units), coreShare: percent(f.coreShare, s) })
}

/** After net to gross: that it holds the core and the corridors, and the lettable share. */
export function netToGrossNote(answer: LettableAnswer, s: Speaker = ENGLISH_SPEAKER): string {
  return s.say('lettable.netToGross', { efficiency: percent(answer.lettable.efficiency, s) })
}

/** The lettable area, the floor types and the area per person, each with its rule. */
export function lettableLines(answer: LettableAnswer, units: Display, several: boolean, s: Speaker = ENGLISH_SPEAKER): string[] {
  const l = answer.lettable
  const lines = [s.say('lettable.total', { area: areaText(l.lettable, units), state: stateText(l.states.lettable, several, s), efficiency: percent(l.efficiency, s), core: areaText(l.core, units), coreShare: percent(l.coreShare, s) })]
  const out = Object.entries(l.notLettable).filter(([, area]) => area > 0).sort((a, b) => b[1] - a[1])
  if (out.length > 0) lines.push(s.say('lettable.notLettable', { uses: out.map(([use, area]) => `${use} ${areaText(area, units)}`).join(', ') }))
  if (several && l.floorTypes.length > 0) {
    const types = l.floorTypes.map((t): Said => said(t.floors.length === 1 ? 'lettable.floorType.one' : 'lettable.floorType.many', { type: t.floorType, count: t.floors.length, efficiency: percent(t.efficiency, s) }))
    lines.push(s.say('lettable.floorTypes', { types: joined(types, 'join.comma') }))
  }
  // MSG-34: the rules in the speaker's language, from the choice they were made with.
  const rules = s === ENGLISH_SPEAKER ? l.rules : lettableRules(l.chosen, s)
  lines.push(rules.lettable, rules.core, rules.efficiency)
  lines.push(...peopleLines(answer.people, units, s))
  return lines
}

/** The area per one of each figure for who the building is for, with its rule; none without one. */
export function peopleLines(people: readonly PeopleRatio[], units: Display, s: Speaker = ENGLISH_SPEAKER): string[] {
  if (people.length === 0) return []
  const lines = people.map((ratio) => {
    const from = ratio.from === 'brief' ? said('people.from.brief') : ratio.from === 'counted' ? said('people.from.counted') : ''
    const one = PERSON_WORD[ratio.kind]
    if (ratio.rooms.length > 0) return s.value(said('people.line.rooms', { one, count: ratio.count, kind: ratio.kind, rooms: ratio.rooms.join(', '), from, net: areaText(ratio.per.net ?? 0, units) }))
    const figures = (['grossInternal', 'grossExternal', 'net', 'lettable'] as const).flatMap((m) => (ratio.per[m] === null ? [] : [said(`people.per.${m}`, { area: areaText(ratio.per[m]!, units) })]))
    return s.value(said('people.line', { one, count: ratio.count, kind: ratio.kind, from, figures: joined(figures, 'join.comma') }))
  })
  return [...lines, s.say('people.rule')]
}

/** Each room's area as written, to the middle of every wall it lies on, by floor and id; null where it cannot be worked out. */
export function asWrittenAreas(survey: Survey): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const room of survey.rooms) {
    if (room.polygon.length < 3) continue
    const walls = [...new Map(room.edges.flatMap((edge) => (edge.wall === null ? [] : [[edge.wall.id, edge.wall] as const]))).values()] as Wall[]
    out.set(`${room.facts.floor}\u0000${room.facts.id}`, toWallMiddles({ polygon: room.polygon, holes: room.holes, walls }))
  }
  return out
}

/** The floors with each room's area as written beside its net. */
export function withAsWritten(floors: readonly FloorAreas[], written: ReadonlyMap<string, number | null>): (FloorAreas & { rooms: (FloorAreas['rooms'][number] & { asWritten?: number | null })[] })[] {
  return floors.map((f) => ({ ...f, rooms: f.rooms.map((room) => (written.has(`${f.floor}\u0000${room.id}`) ? { ...room, asWritten: written.get(`${f.floor}\u0000${room.id}`)! } : room)) }))
}

/** A room's area as written, after its net in a line of `grid_areas`. */
export function asWrittenText(area: number | null | undefined, units: Display, s: Speaker = ENGLISH_SPEAKER): string {
  return area === undefined || area === null ? '' : s.say('asWritten.room', { area: areaText(area, units) })
}

export const AS_WRITTEN_RULE = (s: Speaker = ENGLISH_SPEAKER): string => s.say('asWritten.rule')
