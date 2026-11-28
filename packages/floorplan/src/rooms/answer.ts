/**
 * What writing rooms text says back (WRT-2): the rooms with their inside sizes and what each
 * size on its line measured to, the walls Grid worked out, the openings it placed, what it
 * guessed and what it warns about. The command and the tool server give the same lines.
 */
import { alikeTexts } from '../geometry/alike'
import { floorOf } from '../geometry/floors'
import { english, said } from '../messages/say'
import type { RoomFacts, RoomsResult, SizeBasis } from './compile'
import { f2 } from './words'
import { baseAnswer } from './base'

const TO: Readonly<Record<SizeBasis, string>> = {
  inside: 'inside faces',
  centre: "walls' centre lines",
  outside: 'outside faces',
}

function sizeOf(room: RoomFacts): string {
  // WRT-27: a raw room is measured as every room is; one Grid cannot draw has no size to give.
  if (room.raw === true && room.corners === 0) return english(said('rooms.answer.rawNotDrawn'))
  const inside = `${f2(room.width)} x ${f2(room.depth)} m${room.corners === 4 ? '' : ` overall, ${room.corners} corners`}, ${room.area.toFixed(2)} m² inside`
  if (room.raw === true) return `${inside}, ${english(said('rooms.answer.rawPart'))}`
  if (room.basis === null || room.written === null) return inside
  const w = room.written.width === null ? 'stretched' : f2(room.written.width)
  const d = room.written.depth === null ? 'stretched' : f2(room.written.depth)
  if (room.basis === 'inside') return `${inside} (written ${w} x ${d} to the inside faces)`
  return `${inside} (written ${w} x ${d} to the ${TO[room.basis]})`
}

/**
 * One line per problem, for a refusal. MSG-36: problems alike but for the numbers in their ids (a
 * mistake in a unit repeated along a row, or on every floor copied) are one line (`alikeTexts`).
 */
export function problemLines(result: RoomsResult): string[] {
  return alikeTexts(result.problems.map((p) => `${p.code}: ${p.message}`))
}

/** The answer to a write, without the comparison with the plan before. */
export function roomsAnswer(result: RoomsResult, full = true): string[] {
  const lines: string[] = []
  // WRT-27: every floor that holds a part, raw or worked out.
  const floors = new Set([...result.rooms.map((r) => r.floor), ...(result.plan?.walls ?? []).map((w) => floorOf(w))]).size
  // ARE-16: outdoor space and voids are no floor inside the building: listed, but not in the total.
  const total = result.rooms.reduce((sum, r) => sum + (r.apart === undefined ? r.area : 0), 0)
  const apart = result.rooms.filter((r) => r.apart !== undefined)
  const apartArea = apart.reduce((sum, r) => sum + r.area, 0)
  const derived = result.walls.filter((w) => w.raw !== true).length
  const placed = result.openings.length - (result.raw?.openings ?? 0)
  // WRT-71: the rooms written raw, said on the count, so the zeros worked out after it read right.
  const rawRooms = result.rooms.filter((r) => r.raw === true).length
  const marked = rawRooms === 0 ? '' : english(rawRooms === result.rooms.length ? said('rooms.answer.rawRooms.all') : said('rooms.answer.rawRooms.some', { count: rawRooms }))
  lines.push(
    `${floors} floor${floors === 1 ? '' : 's'}, ${result.rooms.length} room${result.rooms.length === 1 ? '' : 's'}${marked}; ${derived} wall${derived === 1 ? '' : 's'} and their kinds worked out; ${placed} opening${placed === 1 ? '' : 's'} placed; ${total.toFixed(2)} m² inside${apart.length === 0 ? ' in all' : `, plus ${apartArea.toFixed(2)} m² outdoor or void in ${apart.length} room${apart.length === 1 ? '' : 's'} (not in the inside figure)`}.`
  )
  if (result.raw !== undefined) lines.push(english(said('rooms.answer.raw', result.raw)))
  // WRT-75: a fit-out says its base and the base's walls its rooms rest on.
  if (result.base !== undefined) lines.push(baseAnswer(result.base))
  lines.push(`Sizes are to the ${TO[result.sizes.basis]}${result.sizes.stated ? '' : ' unless a room says otherwise (the default)'}.`)
  if (full) {
    lines.push('Rooms, inside faces east-west by north-south:')
    for (const room of result.rooms) lines.push(`  ${room.id} "${room.name}": ${sizeOf(room)}`)
    lines.push('Walls worked out (Grid derives these; change the rooms, not the walls):')
    for (const w of result.walls) {
      const what = w.virtual ? 'dividing line' : `${w.kind} ${w.thickness} m`
      const raw = w.raw === true ? `, ${english(said('rooms.answer.rawPart'))}` : ''
      const by = w.rooms.length === 1 ? `, ${english(said('rooms.answer.outsideWallOf', { room: w.rooms[0]! }))}` : w.rooms.length === 0 ? '' : `, ${w.rooms.join(' | ')}`
      lines.push(`  ${w.id}: ${what}${raw}, ${w.length.toFixed(2)} m${by}`)
    }
    lines.push('Openings:')
    if (result.openings.length === 0) lines.push('  none')
    for (const o of result.openings) lines.push(`  ${o}`)
  } else {
    const named = result.rooms.filter((r) => r.basis !== null && r.basis !== 'inside')
    for (const room of named) lines.push(`  ${room.id}: ${sizeOf(room)}`)
  }
  lines.push(`Guessed (${result.guesses.length}):`)
  for (const g of result.guesses) lines.push(`  ${g}`)
  lines.push(`Warnings (${result.warnings.length}):`)
  // MSG-36: warnings alike are said once.
  for (const w of alikeTexts(result.warnings.map((w) => `${w.code}: ${w.message}`))) lines.push(`  ${w}`)
  return lines
}
