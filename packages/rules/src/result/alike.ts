/**
 * MSG-36: the record's lines that say the same on many parts or floors, said once. A ward whose
 * fourteen rooms have the same door, or a tower whose floors copy one floor's mistake, gives one
 * line, not one per part: its message is the first line's with the parts or the floors it holds
 * for (`line.alike.*`), its `each` every part and its `also` every id, so a mark, a picture or a
 * fix still reaches each of them.
 *
 * Lines are alike when they share their code, kind, kind of thing, cause, figures and firm
 * standard, and their words and fixes are the same once the numbers in quoted ids are set aside
 * (`alikeKey`, in the core): a line that differs in a figure stays a line of its own. A line about
 * the plan as a whole names no part to list, and stands alone. Grouping by room name on one floor
 * (MSG-5) has run before this, so its lines group again across floors.
 */
import { alikeKey, groupAlike, idRuns } from '@ongrid/floorplan/geometry'
import { name, said, say, type Language, type MessageKey, type SayOptions, type Value } from '@ongrid/floorplan/messages'
import type { ResultLine, Thing } from './types'

/** What a line is alike by: null for a line that stands alone. */
function keyOf(l: ResultLine): string | null {
  if (l.thing.kind === 'plan') return null
  return JSON.stringify([
    l.code,
    l.kind,
    l.thing.kind,
    l.causedBy === undefined ? null : [l.causedBy.code, alikeKey(JSON.stringify(l.causedBy.id))],
    alikeKey(l.message),
    alikeKey(l.found),
    alikeKey(l.needed),
    alikeKey(l.fix),
    l.figures ?? null,
    l.firm ?? null,
    l.fixes === undefined ? null : alikeKey(JSON.stringify(l.fixes))
  ])
}

const thingsOf = (l: ResultLine): readonly Thing[] => l.each ?? [l.thing]

/** One line for alike lines: the first, with the parts or floors they hold for. */
function oneFor(group: readonly ResultLine[], language: Language, options: SayOptions): ResultLine {
  const first = group[0]!
  const seen = new Set<string>()
  const each: Thing[] = []
  for (const thing of group.flatMap(thingsOf)) {
    const key = `${thing.kind}:${thing.id}`
    if (seen.has(key)) continue
    seen.add(key)
    each.push(thing)
  }
  const floors = group.map((l) => l.floor)
  const distinct = [...new Set(floors.filter((f): f is string => f !== null))]
  const onePerFloor = distinct.length === group.length && floors.every((f) => f !== null)
  const ids = (list: readonly string[]): Value => idRuns(list, name)
  let words: string
  if (first.thing.kind === 'floor' || onePerFloor) {
    words = say(language, 'line.alike.floors', { message: first.message, count: distinct.length, ids: ids(distinct) }, options)
  } else {
    const values = { message: first.message, count: each.length, what: said(`line.alike.what.${first.thing.kind}` as MessageKey), ids: ids(each.map((t) => t.id)) }
    words = distinct.length > 1
      ? say(language, 'line.alike.parts.floors', { ...values, floors: distinct.length }, options)
      : say(language, 'line.alike.parts', values, options)
  }
  const also = [...new Set(group.flatMap((l) => [l.thing.id, ...l.also]))].filter((id) => id !== first.thing.id)
  const held = group.flatMap((l) => l.held ?? [])
  const fixes = group.flatMap((l) => l.fixes ?? [])
  return {
    ...first,
    message: words,
    also,
    each,
    ...(held.length > 0 ? { held } : {}),
    ...(fixes.length > 0 ? { fixes } : {})
  }
}

/** The lines with every group of alike lines said once, where its first line stood. */
export function alikeLines(lines: readonly ResultLine[], language: Language, options: SayOptions = {}): ResultLine[] {
  return groupAlike(lines, keyOf).map((group) => (group.length === 1 ? group[0]! : oneFor(group, language, options)))
}
