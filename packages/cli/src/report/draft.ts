/**
 * CMD-13: a problem an agent met, as a draft issue the person decides to file. Grid sends
 * nothing: `grid_report_problem` returns the draft and a link to the repository's issue form,
 * and the agent shows the person exactly what would be filed.
 *
 * The draft holds Grid's version, the protocol version and the client's name when they are
 * known, the call and its answer, what the agent expected, the line of the result record
 * (MSG-1) the problem is about, and the smallest plan that shows it.
 *
 * The plan is cut down to the parts the line names (its thing and `also`) and the parts the agent
 * names, and what they touch: a room brings its walls, a door or window its wall, a wall named
 * itself the walls that meet it and its openings. With nothing named, the whole plan is kept.
 *
 * Then it is cleared (HND-9: no person's name travels; MSG-9: the plan's text rule):
 *
 * - each room's name is replaced by its use (`bedroom`, `bedroom 2`), or `room` when it states none;
 * - every id is replaced by its kind and a number (`room-1`, `wall-3`, `door-2`);
 * - a floor's name becomes `floor 1`, a fixture's label goes, and so do the trace image, the
 *   project id, the record of how the plan was written, the site and the front (CNT-3) and
 *   every field Grid does not know; the north and the y direction are kept;
 * - in every text of the draft (the message, the answer, the call's arguments, what was
 *   expected) the plan's names and ids get the same replacements, and paths, file names, web
 *   addresses and email addresses are replaced by `<path>`, `<file>`, `<address>` and `<email>`.
 *
 * What is left is held to the plan's text rule before it is shown.
 */
import { tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { BUILDING_TYPES, ITEM_KINDS, ROOM_TENURES, ROOM_USES, Y_AXES, readBuilding, readUse } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL, RESULT_VERSION, type GridResult, type ResultLine } from '@ongrid/rules'
import { planTextProblem } from '../command/planText'

/** The label of every report an agent drafted, on the issue and in the issue template. */
export const AGENT_LABEL = 'agent-drafted'
/** The issue template the link opens, under `.github/ISSUE_TEMPLATE/`. */
export const AGENT_TEMPLATE = 'agent-drafted.md'
/** GitHub's issue form takes a link of about 8 KB; a longer draft is pasted instead. */
export const LINK_MAX = 8000
/** Most parts the agent may name, besides those the record's line names. */
export const PARTS_MAX = 20

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Part = Record<string, unknown>

export interface DraftRequest {
  /** The tool that was called, `grid_…`. */
  readonly tool: string
  /** Its arguments, as sent. */
  readonly arguments?: Readonly<Record<string, unknown>>
  /** Its answer, as the agent got it. */
  readonly answer?: string
  /** What the agent expected instead. */
  readonly expected: string
  /** The code of the record's line the problem is about. */
  readonly code?: string
  /** Ids of the parts the problem is about. */
  readonly parts?: readonly string[]
  /** The agent's host, as it names itself. */
  readonly client?: string
}

export interface DraftContext {
  readonly gridVersion: string
  /** The protocol version the request named, or how the server knows it. */
  readonly protocol: string
  /** The plan file's text as it was read: null when the plan could not be read as JSON. */
  readonly raw: unknown
  /** The record of the plan, from the same code as `grid_check`. */
  readonly record: GridResult
  /** Why the command would refuse the plan, when it would. Grid's own words. */
  readonly refusal?: string
  /** Texts to replace wherever they appear: the plan file's path and name, the project folder. */
  readonly paths: readonly string[]
  /** The repository's address, without a slash at the end. */
  readonly repository: string
}

export interface Draft {
  readonly title: string
  readonly body: string
  readonly labels: readonly string[]
  /** The issue form with the title, the label and, when it fits, the body filled in. */
  readonly link: string
  readonly linkHasBody: boolean
  /** The plan as it would be filed. Null when the plan could not be read. */
  readonly plan: Record<string, Json> | null
  readonly kept: { readonly walls: readonly [number, number]; readonly rooms: readonly [number, number]; readonly openings: readonly [number, number]; readonly items: readonly [number, number] }
  readonly line: ResultLine | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listOf(raw: Record<string, unknown>, key: string): Part[] {
  const value = raw[key]
  return Array.isArray(value) ? value.filter(isObject) : []
}

function idOf(part: Part): string | null {
  return typeof part['id'] === 'string' ? part['id'] : null
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function point(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && finiteNumber(value[0]) && finiteNumber(value[1]) ? [value[0], value[1]] : null
}

/** How far a point is from a segment, in metres. */
function toSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Whether two segments cross or touch. */
function crosses(a0: readonly [number, number], a1: readonly [number, number], b0: readonly [number, number], b1: readonly [number, number]): boolean {
  const side = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return side(a0, a1, b0) !== side(a0, a1, b1) && side(b0, b1, a0) !== side(b0, b1, a1)
}

/**
 * Whether two walls meet: they cross, or an end of one lies on the other within half the
 * thicker and the gap tolerance.
 */
function touches(one: Part, other: Part): boolean {
  const a = [point(one['start']), point(one['end'])]
  const b = [point(other['start']), point(other['end'])]
  if (a.includes(null) || b.includes(null)) return false
  const [a0, a1] = a as [[number, number], [number, number]]
  const [b0, b1] = b as [[number, number], [number, number]]
  const thick = Math.max(finiteNumber(one['thickness']) ? one['thickness'] : 0, finiteNumber(other['thickness']) ? other['thickness'] : 0)
  const reach = thick / 2 + tolerance('gap')
  return crosses(a0, a1, b0, b1) || toSegment(a0, b0, b1) <= reach || toSegment(a1, b0, b1) <= reach || toSegment(b0, a0, a1) <= reach || toSegment(b1, a0, a1) <= reach
}

function wallsOfRoom(room: Part): string[] {
  const walls: string[] = []
  const boundary = room['boundary']
  if (Array.isArray(boundary)) for (const id of boundary) if (typeof id === 'string') walls.push(id)
  const holes = room['holes']
  if (Array.isArray(holes)) for (const hole of holes) if (Array.isArray(hole)) for (const id of hole) if (typeof id === 'string') walls.push(id)
  return walls
}

interface Cut {
  readonly walls: Part[]
  readonly rooms: Part[]
  readonly openings: Part[]
  readonly items: Part[]
  readonly floors: Part[]
  readonly whole: boolean
}

/** The parts the problem is about, and what they touch. Everything when nothing is named. */
function cutDown(raw: Record<string, unknown>, named: ReadonlySet<string>): Cut {
  const walls = listOf(raw, 'walls')
  const rooms = listOf(raw, 'rooms')
  const openings = listOf(raw, 'openings')
  const items = listOf(raw, 'items')
  const floors = listOf(raw, 'floors')
  const known = new Set([...walls, ...rooms, ...openings, ...items].map(idOf).filter((id): id is string => id !== null))
  const asked = [...named].filter((id) => known.has(id))
  if (asked.length === 0) return { walls, rooms, openings, items, floors, whole: true }

  const has = (part: Part): boolean => named.has(idOf(part) ?? '')
  const keptRooms = rooms.filter(has)
  const keptItems = items.filter(has)
  const namedWalls = walls.filter(has)
  const wallIds = new Set(namedWalls.map(idOf))
  for (const room of keptRooms) for (const id of wallsOfRoom(room)) wallIds.add(id)
  const namedOpenings = openings.filter(has)
  for (const opening of namedOpenings) if (typeof opening['wall'] === 'string') wallIds.add(opening['wall'])
  for (const wall of walls) if (!wallIds.has(idOf(wall)) && namedWalls.some((n) => touches(n, wall))) wallIds.add(idOf(wall))
  const keptWalls = walls.filter((wall) => wallIds.has(idOf(wall)))
  const directWalls = new Set(namedWalls.map(idOf))
  const keptOpenings = openings.filter((o) => has(o) || directWalls.has(typeof o['wall'] === 'string' ? o['wall'] : null))
  const onFloors = new Set([...keptWalls, ...keptRooms, ...keptItems].map((part) => part['floor']).filter((f): f is string => typeof f === 'string'))
  const keptFloors = floors.filter((floor) => onFloors.has(idOf(floor) ?? '') || (onFloors.size === 0 && floors.length === 1))
  return { walls: keptWalls, rooms: keptRooms, openings: keptOpenings, items: keptItems, floors: keptFloors, whole: false }
}

/** The fields of each part a draft keeps: geometry and Grid's own words, never free text. */
const KEPT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  walls: ['start', 'end', 'thickness', 'height', 'kind', 'virtual'],
  rooms: ['inside', 'height', 'floorOffset', 'tenure'],
  openings: ['type', 'offset', 'width', 'sill', 'height', 'hinge', 'swing'],
  items: ['at', 'size', 'height', 'turn'],
  floors: ['level', 'elevation', 'height', 'slab', 'building'],
}
const WALL_KINDS = ['exterior', 'interior', 'partition']
/** The fields that hold one of the format's own words, which are kept only when they are one. */
const WORDS: Readonly<Record<string, readonly string[]>> = {
  kind: WALL_KINDS,
  type: ['door', 'window', 'opening'],
  hinge: ['start', 'end'],
  swing: ['left', 'right'],
  tenure: ROOM_TENURES,
  building: BUILDING_TYPES,
}
/** A room's use as Grid reads it (CNT-5: `WC` is toilet), or null. */
const roomUseOf = (value: unknown): string | null => {
  const read = readUse(value)
  return typeof read === 'string' && (ROOM_USES as readonly string[]).includes(read) ? read : null
}

/** CNT-18: a curved wall's arc, numbers only, kept as the wall's geometry: its centre and sweep. */
function arcOf(wall: Part): Record<string, Json> {
  const arc = wall['arc']
  if (!isObject(arc)) return {}
  const centre = plainValue(arc['centre'])
  const sweep = arc['sweep']
  return Array.isArray(centre) && centre.length === 2 && finiteNumber(sweep) ? { arc: { centre, sweep } } : {}
}

/** Only plain JSON: numbers, booleans, and lists and objects of them. Text is never copied. */
function plainValue(value: unknown): Json | undefined {
  if (typeof value === 'boolean' || finiteNumber(value)) return value
  if (Array.isArray(value)) {
    const items = value.map(plainValue)
    return items.every((item) => item !== undefined) ? (items as Json[]) : undefined
  }
  return undefined
}

/** Replaces each name and id the plan holds, and says what each became. */
class Clearing {
  /** Text found in the plan, and what it is replaced by, longest first when applied. */
  private readonly replacements = new Map<string, string>()
  private readonly ids = new Map<string, string>()

  constructor(private readonly paths: readonly string[]) {}

  id(original: unknown, made: string): string {
    if (typeof original !== 'string' || original === '') return made
    const known = this.ids.get(original)
    if (known !== undefined) return known
    this.ids.set(original, made)
    this.replacements.set(original, made)
    return made
  }

  idOf(original: unknown): string | null {
    return typeof original === 'string' ? (this.ids.get(original) ?? null) : null
  }

  name(original: unknown, made: string): void {
    if (typeof original === 'string' && original.trim() !== '' && !this.replacements.has(original)) this.replacements.set(original, made)
  }

  /** A text of the draft, cleared. */
  text(text: string): string {
    let out = text
    for (const path of [...this.paths].filter((p) => p.length > 0).sort((a, b) => b.length - a.length)) out = out.split(path).join('<path>')
    out = out
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]+/gi, '<address>')
      .replace(/\bwww\.[^\s"'<>`]+/gi, '<address>')
      // A drive, a home or a relative start and one name or more; a bare slash, two names or more.
      .replace(/(?:\b[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/])[^\s"'<>`|]*|(?<![\w.])[\\/][^\s"'<>`|\\/]+(?:[\\/][^\s"'<>`|\\/]+)+[\\/]?/g, '<path>')
      .replace(/(?<![\w.-])[\w.-]+\.(?:json|rooms|png|jpe?g|svg|pdf|dxf|ifc|glb|obj|txt|csv)\b/gi, '<file>')
    if (this.replacements.size === 0) return out
    // One pass, longest first, so a replacement is never itself replaced again.
    const keys = [...this.replacements.keys()].sort((a, b) => b.length - a.length)
    const pattern = new RegExp(`(?<![A-Za-z0-9_-])(?:${keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9_-])`, 'g')
    return out.replace(pattern, (found) => this.replacements.get(found) ?? found)
  }

  /** Any JSON value, with every text cleared and every key that is not plain dropped. */
  value(value: unknown): Json {
    if (typeof value === 'string') return this.text(value)
    if (typeof value === 'boolean' || finiteNumber(value) || value === null) return value
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => this.value(item))
    if (isObject(value)) {
      const out: Record<string, Json> = {}
      for (const [key, item] of Object.entries(value)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) continue
        out[key] = /^(plan|plans|out|path)$/.test(key) ? (Array.isArray(item) ? item.map(() => '<file>') : '<file>') : this.value(item)
      }
      return out
    }
    return null
  }
}

function usesOf(rooms: readonly Part[]): Map<Part, string> {
  const uses = new Map<Part, string>()
  const count = new Map<string, number>()
  const total = new Map<string, number>()
  const roomUse = (room: Part): string => roomUseOf(room['use']) ?? 'room'
  for (const room of rooms) total.set(roomUse(room), (total.get(roomUse(room)) ?? 0) + 1)
  for (const room of rooms) {
    const use = roomUse(room)
    const n = (count.get(use) ?? 0) + 1
    count.set(use, n)
    uses.set(room, total.get(use)! > 1 ? `${use} ${n}` : use)
  }
  return uses
}

/** The plan as it would be filed: cut down, every name and id replaced, nothing but geometry kept. */
function clearedPlan(raw: Record<string, unknown>, cut: Cut, clearing: Clearing): Record<string, Json> {
  // Ids are numbered over the whole plan, so a part keeps its number whatever is cut.
  const counters = new Map<string, number>()
  const next = (kind: string): string => {
    const n = (counters.get(kind) ?? 0) + 1
    counters.set(kind, n)
    return `${kind}-${n}`
  }
  for (const floor of listOf(raw, 'floors')) clearing.id(floor['id'], next('floor'))
  for (const wall of listOf(raw, 'walls')) clearing.id(wall['id'], next('wall'))
  const allRooms = listOf(raw, 'rooms')
  for (const room of allRooms) clearing.id(room['id'], next('room'))
  for (const opening of listOf(raw, 'openings')) {
    const type = typeof opening['type'] === 'string' && ['door', 'window', 'opening'].includes(opening['type']) ? opening['type'] : 'opening'
    clearing.id(opening['id'], next(type))
  }
  for (const item of listOf(raw, 'items')) clearing.id(item['id'], next('item'))
  // Names: a room's becomes its use, over the whole plan, so the message's names read the same.
  const uses = usesOf(allRooms)
  for (const room of allRooms) clearing.name(room['name'], uses.get(room)!)
  listOf(raw, 'floors').forEach((floor, i) => clearing.name(floor['name'], `floor ${i + 1}`))
  for (const item of listOf(raw, 'items')) clearing.name(item['label'], typeof item['kind'] === 'string' && (ITEM_KINDS as readonly string[]).includes(item['kind']) ? item['kind'] : 'fixture')

  const part = (kind: string, from: Part, extra: Record<string, Json> = {}): Record<string, Json> => {
    const out: Record<string, Json> = { id: clearing.idOf(from['id']) ?? `${kind}-?` }
    for (const field of KEPT_FIELDS[kind]!) {
      const value = plainValue(from[field])
      if (value !== undefined) out[field] = value
      else if (typeof from[field] === 'string' && Object.hasOwn(WORDS, field)) {
        const text = from[field] as string
        const allowed = WORDS[field]!
        if (allowed.includes(text)) out[field] = text
      }
    }
    const floor = clearing.idOf(from['floor'])
    if (floor !== null) out['floor'] = floor
    return { ...out, ...extra }
  }
  const ids = (list: unknown): Json[] => (Array.isArray(list) ? list.map((id) => clearing.idOf(id) ?? 'wall-?') : [])
  const plan: Record<string, Json> = { version: '1', units: 'm' }
  // CNT-5: what kind of building it is decides which checks run, and is one of the format's words.
  const building = readBuilding(raw['building'])
  if (typeof building === 'string' && (BUILDING_TYPES as readonly string[]).includes(building)) plan['building'] = building
  if (cut.floors.length > 0) {
    plan['floors'] = cut.floors.map((floor) => {
      const i = listOf(raw, 'floors').indexOf(floor)
      return part('floors', floor, { name: `floor ${i + 1}` })
    })
  }
  plan['walls'] = cut.walls.map((wall) => part('walls', wall, arcOf(wall)))
  plan['rooms'] = cut.rooms.map((room) => {
    const extra: Record<string, Json> = { name: uses.get(room)!, boundary: ids(room['boundary']) }
    const use = roomUseOf(room['use'])
    if (use !== null) extra['use'] = use
    if (Array.isArray(room['holes'])) extra['holes'] = room['holes'].map(ids)
    const { id, ...rest } = part('rooms', room)
    return { id: id!, ...extra, ...rest }
  })
  plan['openings'] = cut.openings.map((opening) => {
    const { id, ...rest } = part('openings', opening)
    return { id: id!, wall: clearing.idOf(opening['wall']) ?? 'wall-?', ...rest }
  })
  if (cut.items.length > 0) {
    plan['items'] = cut.items.map((item) => {
      const kind = typeof item['kind'] === 'string' && (ITEM_KINDS as readonly string[]).includes(item['kind']) ? item['kind'] : 'fixture'
      const { id, ...rest } = part('items', item)
      return { id: id!, kind, ...rest }
    })
  }
  // CNT-3: which way the plan faces is a number and a word of Grid's; where it sits, a place on
  // the earth, and its front, an id, are left out.
  if (typeof raw['north'] === 'number' && Number.isFinite(raw['north'])) plan['north'] = raw['north']
  if (typeof raw['yAxis'] === 'string' && (Y_AXES as readonly string[]).includes(raw['yAxis'])) plan['yAxis'] = raw['yAxis']
  return plan
}

/** The record's line the problem is about: by its code, and among those, one about a named part. */
function lineOf(record: GridResult, code: string | undefined, parts: readonly string[]): ResultLine | null {
  if (code === undefined) return record.read ? null : (record.lines[0] ?? null)
  const lines = record.lines.filter((line) => line.code === code)
  return lines.find((line) => parts.includes(line.thing.id)) ?? lines[0] ?? null
}

/** The ids a line's words quote, as `"wall-7"` in "its corner with wall "wall-7"". */
function quotedIds(line: ResultLine): string[] {
  return [line.message, line.found, line.needed, line.fix].flatMap((text) => [...text.matchAll(/"([^"\n]{1,64})"/g)].map((m) => m[1]!))
}

/** The plan with one part to a line: short enough to read, and still JSON. */
function planJson(plan: Record<string, Json>): string {
  const lines = ['{']
  const entries = Object.entries(plan)
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? ',' : ''
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`  ${JSON.stringify(key)}: [`)
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j < value.length - 1 ? ',' : ''}`))
      lines.push(`  ]${comma}`)
    } else lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`)
  })
  lines.push('}')
  return lines.join('\n')
}

function fence(language: string, text: string): string {
  // A fence longer than any run of backticks inside, so the draft cannot close it early.
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${language}\n${text}\n${ticks}`
}

function counted(kept: number, all: number, what: string): string {
  return `${kept} of ${all} ${what}${all === 1 ? '' : 's'}`
}

/** Builds the draft. Nothing is sent and nothing is written. */
export function buildDraft(request: DraftRequest, context: DraftContext): Draft {
  const clearing = new Clearing(context.paths)
  const raw = isObject(context.raw) ? context.raw : null
  const parts = request.parts ?? []
  const line = lineOf(context.record, request.code, parts)
  const named = new Set<string>([...parts, ...(line && line.thing.kind !== 'plan' ? [line.thing.id, ...line.also, ...quotedIds(line)] : [])])
  const cut = raw === null ? null : cutDown(raw, named)
  const plan = raw === null || cut === null ? null : clearedPlan(raw, cut, clearing)
  if (plan !== null) {
    // MSG-9: what is filed holds to the plan's own text rule. Every text in it is Grid's.
    const problem = planTextProblem(plan)
    if (problem !== null) throw new Error(`the cleared plan breaks the plan's text rule: ${problem}`)
  }

  const all = (key: string): number => (raw === null ? 0 : listOf(raw, key).length)
  const kept = {
    walls: [cut?.walls.length ?? 0, all('walls')] as const,
    rooms: [cut?.rooms.length ?? 0, all('rooms')] as const,
    openings: [cut?.openings.length ?? 0, all('openings')] as const,
    items: [cut?.items.length ?? 0, all('items')] as const,
  }
  const what = line === null ? (request.code !== undefined ? request.code : 'an answer not as expected') : line.code
  const title = clearing.text(`[agent] ${request.tool}: ${what}`).slice(0, 120)

  const record = context.record
  const sections: string[] = [
    '## What the agent expected',
    '',
    clearing.text(request.expected),
    '',
    '## The call',
    '',
    `Tool: \`${request.tool}\``,
    '',
    fence('json', JSON.stringify(clearing.value(request.arguments ?? {}), null, 2)),
    '',
  ]
  if (request.answer !== undefined) sections.push('Its answer:', '', fence('text', clearing.text(request.answer)), '')
  sections.push('## The result record', '')
  sections.push(`Read: ${record.read ? 'yes' : 'no, the plan was refused'}. Lines: ${record.count} (${Object.entries(record.counts).filter(([, n]) => n > 0).map(([kind, n]) => `${n} ${kind}`).join(', ') || 'none'}).`)
  if (context.refusal !== undefined) sections.push('', `The command refuses the plan: ${clearing.text(context.refusal)}`)
  if (line !== null) {
    sections.push(
      '',
      `Code \`${line.code}\`, ${line.kind}, about ${line.thing.kind} \`${clearing.text(line.thing.id) || 'the plan'}\`${line.also.length > 0 ? ` and ${line.also.map((id) => `\`${clearing.text(id)}\``).join(', ')}` : ''}.`,
      '',
      `- Message: ${clearing.text(line.message)}`,
      `- Found: ${clearing.text(line.found)}`,
      `- Needed: ${clearing.text(line.needed)}`,
      `- Fix: ${clearing.text(line.fix)}`,
    )
  } else if (request.code !== undefined) {
    sections.push('', `The record holds no line with code \`${clearing.text(request.code)}\`.`)
  }
  sections.push(
    '',
    '## Versions',
    '',
    `- Grid ${context.gridVersion}, result record version ${RESULT_VERSION}`,
    `- Protocol: ${context.protocol}`,
    `- Client: ${request.client === undefined ? 'not given' : clearing.text(request.client)}`,
    '',
    '## The smallest plan that shows it',
    '',
  )
  if (plan === null || cut === null) {
    sections.push('The plan could not be read as JSON, so none is attached.')
  } else {
    sections.push(
      `${cut.whole ? 'The whole plan: nothing in the report names a part of it.' : 'Cut down to the parts the report names and what they touch:'} ${counted(kept.walls[0], kept.walls[1], 'wall')}, ${counted(kept.rooms[0], kept.rooms[1], 'room')}, ${counted(kept.openings[0], kept.openings[1], 'opening')}${kept.items[1] > 0 ? `, ${counted(kept.items[0], kept.items[1], 'fixture')}` : ''}.`,
      'Room names are replaced by their uses and every id by its kind and a number; floor names, fixture labels, the trace image, the project id and fields Grid does not know are left out.',
      '',
      fence('json', planJson(plan)),
    )
  }
  sections.push('', '---', '', `Drafted by an agent with \`grid_report_problem\`. Grid sent nothing: a person read this and chose to file it. ${GENERAL_GUIDANCE_LABEL}.`)
  const body = sections.join('\n')

  const query = (withBody: boolean): string => {
    const params = new URLSearchParams({ template: AGENT_TEMPLATE, labels: AGENT_LABEL, title })
    if (withBody) params.set('body', body)
    return `${context.repository}/issues/new?${params.toString()}`
  }
  const full = query(true)
  const linkHasBody = full.length <= LINK_MAX
  return { title, body, labels: [AGENT_LABEL], link: linkHasBody ? full : query(false), linkHasBody, plan, kept, line }
}
