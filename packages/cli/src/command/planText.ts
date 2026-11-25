/**
 * MSG-9: the text a plan file may hold, checked when the file is read, before the schema.
 *
 * A plan from someone else can hold anything in its names and ids. Grid quotes them, but a
 * name of fifty million characters, a line break that starts a line of its own in a report, a
 * direction character that shows a name backwards, or a control character that makes the 2D
 * drawing unreadable are refused here, naming the part and the limit, never the text itself.
 * Only the strings the schema keeps are looked at; everything else is the schema's to refuse.
 */

/** The most characters a name may have. */
export const NAME_MAX = 120
/** The most characters an id may have: the same as the tool server takes. */
export const ID_MAX = 64
/** The most characters the trace image's path may have. */
export const IMAGE_PATH_MAX = 1024
/** The most walls, rooms, openings, floors, items or stairs a plan may have, each. */
export const PARTS_MAX = 50_000
/** The most walls a room's boundary may list. */
export const BOUNDARY_MAX = 2_000
/** CNT-9: the most facts of the person's own one wall, opening, room or floor may carry. */
export const PROPERTIES_MAX = 100
/** LVL-8: the most floors one opening pattern may be repeated on. */
export const PATTERN_FLOORS_MAX = 200
/** The largest plan file Grid reads, in bytes. */
export const PLAN_FILE_MAX_BYTES = 64 * 1024 * 1024

/** Line breaks of every kind: one would start a line of its own in a report. */
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/
/** Control characters (C0, DEL, C1), which a standalone SVG may not hold. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/** Characters that change the direction text is shown in, so a name can read backwards. */
const DIRECTION = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/
/** Half of a UTF-16 pair with no other half: no character at all. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

/** Every character the tool server refuses in an argument, too. */
export const UNSAFE_TEXT = new RegExp(`${LINE_BREAK.source}|${CONTROL.source}|${DIRECTION.source}|${LONE_SURROGATE.source}`)

function codePoint(text: string, pattern: RegExp): string {
  const found = pattern.exec(text)![0]
  return `U+${found.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
}

/** What is wrong with one piece of text, or null. Never quotes the text. */
export function textProblem(text: string, kind: 'name' | 'id' | 'path'): string | null {
  if (LINE_BREAK.test(text)) return `holds a line break (${codePoint(text, LINE_BREAK)}); it must be one line`
  if (CONTROL.test(text)) return `holds a control character (${codePoint(text, CONTROL)})`
  if (DIRECTION.test(text)) return `holds a direction character (${codePoint(text, DIRECTION)}), which can show text backwards`
  if (LONE_SURROGATE.test(text)) return 'holds half of a character pair, which is no character'
  const max = kind === 'name' ? NAME_MAX : kind === 'id' ? ID_MAX : IMAGE_PATH_MAX
  if (text.length > max) return `is ${text.length.toLocaleString('en-US')} characters long; ${kind === 'id' ? 'an id' : `a ${kind}`} may have at most ${max}`
  return null
}

type Kind = 'name' | 'id' | 'path'

/** The strings of each part the schema keeps, and what each is. */
const FIELDS: Readonly<Record<string, Readonly<Record<string, Kind>>>> = {
  // LVL-5: a wall names the highest floor it rises through.
  walls: { id: 'id', floor: 'id', through: 'id' },
  // CNT-8: the room a zone is part of is an id. CNT-9: a room's number is held to an id's limit.
  rooms: { id: 'id', name: 'name', floor: 'id', partOf: 'id', number: 'id' },
  openings: { id: 'id', wall: 'id' },
  floors: { id: 'id', name: 'name' },
  // LVL-3: a stair names the two floors it joins.
  stairs: { id: 'id', name: 'name', from: 'id', to: 'id' },
  // CNT-12: a fixture's kind is held to an id's limit, its label to a name's.
  items: { id: 'id', kind: 'id', label: 'name', floor: 'id' },
  // SHT-7: writing on the drawing and the sketch layer.
  annotations: { id: 'id', text: 'name', room: 'id', floor: 'id' },
  sketch: { id: 'id', category: 'id', text: 'name', floor: 'id' },
  // LVL-8: an opening pattern names its wall, and the floors it repeats on (below).
  patterns: { id: 'id', wall: 'id' },
  // VEW-3: a saved view's name, and the floor it shows cut away.
  views: { name: 'name', cut: 'id' },
  // CNT-4: a flat type, and a flat with the type it names; its rooms are ids (below).
  flatTypes: { id: 'id', name: 'name' },
  flats: { id: 'id', name: 'name', type: 'id' },
  // CNT-16: a column names its floor and the highest floor it rises through; a structural grid
  // has a name (its floors and its lines' names are in the schema's own text checks).
  columns: { id: 'id', floor: 'id', through: 'id', label: 'name' },
  grids: { id: 'id', name: 'name' },
  // CNT-19: a bay's number is held to an id's limit; a ramp names the two floors it joins.
  bays: { id: 'id', number: 'id', floor: 'id' },
  ramps: { id: 'id', name: 'name', from: 'id', to: 'id' },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The first text in a plan, as parsed from JSON, that passes a limit, as `rooms[3].name is …`,
 * or null. Types are left to the schema: a name that is not a string is not looked at here.
 */
export function planTextProblem(raw: Record<string, unknown>): string | null {
  for (const [list, fields] of Object.entries(FIELDS)) {
    const parts = raw[list]
    if (!Array.isArray(parts)) continue
    if (parts.length > PARTS_MAX) {
      return `${list} has ${parts.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} ${list}`
    }
    for (let i = 0; i < parts.length; i++) {
      const part: unknown = parts[i]
      if (!isObject(part)) continue
      for (const [field, kind] of Object.entries(fields)) {
        const value = part[field]
        if (typeof value !== 'string') continue
        const problem = textProblem(value, kind)
        if (problem) return `${list}[${i}].${field} ${problem}`
      }
      if (list === 'floors') {
        // LVL-6: a floor's rooflights, each with an id.
        const roof = part['roof']
        const lights = isObject(roof) ? roof['rooflights'] : undefined
        if (Array.isArray(lights)) {
          if (lights.length > PARTS_MAX) {
            return `floors[${i}].roof.rooflights has ${lights.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} rooflights in one roof`
          }
          for (let r = 0; r < lights.length; r++) {
            const light: unknown = lights[r]
            const problem = isObject(light) && typeof light['id'] === 'string' ? textProblem(light['id'], 'id') : null
            if (problem) return `floors[${i}].roof.rooflights[${r}].id ${problem}`
          }
        }
      }
      // CNT-9: the facts of the person's own: each name and each text value to a name's limit.
      const facts = part['properties']
      if ((list === 'walls' || list === 'rooms' || list === 'openings' || list === 'floors') && isObject(facts)) {
        const names = Object.keys(facts)
        if (names.length > PROPERTIES_MAX) return `${list}[${i}].properties has ${names.length.toLocaleString('en-US')} facts; one part may carry at most ${PROPERTIES_MAX}`
        for (const [n, name] of names.entries()) {
          const named = textProblem(name, 'name')
          if (named) return `${list}[${i}].properties, fact ${n + 1}, has a name that ${named}`
          const value = facts[name]
          const problem = typeof value === 'string' ? textProblem(value, 'name') : null
          if (problem) return `${list}[${i}].properties, fact ${n + 1}, has a value that ${problem}`
        }
      }
      // CNT-4: the rooms a flat holds, each an id.
      const held = part['rooms']
      if (list === 'flats' && Array.isArray(held)) {
        if (held.length > PARTS_MAX) return `flats[${i}].rooms lists ${held.length.toLocaleString('en-US')} rooms; a flat may list at most ${PARTS_MAX.toLocaleString('en-US')}`
        for (let k = 0; k < held.length; k++) {
          const id: unknown = held[k]
          const problem = typeof id === 'string' ? textProblem(id, 'id') : null
          if (problem) return `flats[${i}].rooms[${k}] ${problem}`
        }
      }
      // LVL-8: the floors an opening pattern is repeated on, each an id.
      const repeats = part['floors']
      if (list === 'patterns' && Array.isArray(repeats)) {
        if (repeats.length > PATTERN_FLOORS_MAX) return `patterns[${i}].floors lists ${repeats.length.toLocaleString('en-US')} floors; a pattern may be repeated on at most ${PATTERN_FLOORS_MAX}`
        for (let k = 0; k < repeats.length; k++) {
          const id: unknown = repeats[k]
          const problem = typeof id === 'string' ? textProblem(id, 'id') : null
          if (problem) return `patterns[${i}].floors[${k}] ${problem}`
        }
      }
      if (list === 'rooms') {
        // The room's own walls, then each of its holes' (ARE-6).
        const lists: [string, unknown][] = [[`rooms[${i}].boundary`, part['boundary']]]
        const holes = part['holes']
        if (Array.isArray(holes)) {
          if (holes.length > PARTS_MAX) {
            return `rooms[${i}].holes has ${holes.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} holes in one room`
          }
          holes.forEach((hole, h) => lists.push([`rooms[${i}].holes[${h}]`, hole]))
        }
        for (const [where, walls] of lists) {
          if (!Array.isArray(walls)) continue
          if (walls.length > BOUNDARY_MAX) {
            return `${where} lists ${walls.length.toLocaleString('en-US')} walls; a room may list at most ${BOUNDARY_MAX.toLocaleString('en-US')}`
          }
          for (let k = 0; k < walls.length; k++) {
            const id: unknown = walls[k]
            const problem = typeof id === 'string' ? textProblem(id, 'id') : null
            if (problem) return `${where}[${k}] ${problem}`
          }
        }
        // LVL-4: the zones of a room's ceiling, each named like a room, its outline as long as a boundary.
        const ceiling = part['ceiling']
        const zones = isObject(ceiling) ? ceiling['lowered'] : undefined
        if (Array.isArray(zones)) {
          if (zones.length > PARTS_MAX) {
            return `rooms[${i}].ceiling.lowered has ${zones.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} lowered zones in one ceiling`
          }
          for (let z = 0; z < zones.length; z++) {
            const zone: unknown = zones[z]
            if (!isObject(zone)) continue
            const problem = typeof zone['name'] === 'string' ? textProblem(zone['name'], 'name') : null
            if (problem) return `rooms[${i}].ceiling.lowered[${z}].name ${problem}`
            const points = zone['points']
            if (Array.isArray(points) && points.length > BOUNDARY_MAX) {
              return `rooms[${i}].ceiling.lowered[${z}].points has ${points.length.toLocaleString('en-US')} points; a lowered zone may have at most ${BOUNDARY_MAX.toLocaleString('en-US')}`
            }
          }
        }
      }
    }
  }
  const projectId = raw['projectId']
  if (typeof projectId === 'string') {
    const problem = textProblem(projectId, 'id')
    if (problem) return `projectId ${problem}`
  }
  const planName = raw['name']
  if (typeof planName === 'string') {
    const problem = textProblem(planName, 'name')
    if (problem) return `name ${problem}`
  }
  const title = raw['title']
  if (typeof title === 'string') {
    const problem = textProblem(title, 'name')
    if (problem) return `title ${problem}`
  }
  // CNT-3: the front names a wall or an opening by its id.
  const front = raw['front']
  if (isObject(front)) {
    for (const field of ['wall', 'opening']) {
      const id = front[field]
      const problem = typeof id === 'string' ? textProblem(id, 'id') : null
      if (problem) return `front.${field} ${problem}`
    }
  }
  // COD-3: the place is a name or a code; one Grid does not know is left out when the plan is read.
  const site = raw['site']
  if (isObject(site) && typeof site['country'] === 'string') {
    const problem = textProblem(site['country'], 'name')
    if (problem) return `site.country ${problem}`
  }
  // BRF-3: the plot's boundary and the site's things, each with an id and a label.
  if (isObject(site)) {
    const boundary = site['boundary']
    if (Array.isArray(boundary) && boundary.length > BOUNDARY_MAX) {
      return `site.boundary has ${boundary.length.toLocaleString('en-US')} points; a boundary may have at most ${BOUNDARY_MAX.toLocaleString('en-US')}`
    }
    const things = site['things']
    if (Array.isArray(things)) {
      if (things.length > PARTS_MAX) return `site.things has ${things.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} things on its site`
      for (let i = 0; i < things.length; i++) {
        const thing: unknown = things[i]
        if (!isObject(thing)) continue
        for (const [field, kind] of [['id', 'id'], ['label', 'name']] as const) {
          const value = thing[field]
          const problem = typeof value === 'string' ? textProblem(value, kind) : null
          if (problem) return `site.things[${i}].${field} ${problem}`
        }
        const points = thing['points']
        if (Array.isArray(points) && points.length > BOUNDARY_MAX) {
          return `site.things[${i}].points has ${points.length.toLocaleString('en-US')} points; one of the site's things may have at most ${BOUNDARY_MAX.toLocaleString('en-US')}`
        }
      }
    }
  }
  const image = raw['referenceImage']

  if (isObject(image) && typeof image['path'] === 'string') {
    const problem = textProblem(image['path'], 'path')
    if (problem) return `referenceImage.path ${problem}`
  }
  // CNT-10: the base plan's path, held to a path's limit like the trace image's.
  if (typeof raw['base'] === 'string') {
    const problem = textProblem(raw['base'], 'path')
    if (problem) return `base ${problem}`
  }
  return null
}
