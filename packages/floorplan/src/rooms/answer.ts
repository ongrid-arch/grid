/**
 * What writing rooms text says back (WRT-2): the rooms with their inside sizes and what each
 * size on its line measured to, the walls Grid worked out, the openings it placed, what it
 * guessed and what it warns about. The command and the tool server give the same lines.
 */
import type { RoomFacts, RoomsResult, SizeBasis } from './compile'
import { f2 } from './words'

const TO: Readonly<Record<SizeBasis, string>> = {
  inside: 'inside faces',
  centre: "walls' centre lines",
  outside: 'outside faces',
}

function sizeOf(room: RoomFacts): string {
  const inside = `${f2(room.width)} x ${f2(room.depth)} m${room.corners === 4 ? '' : ` overall, ${room.corners} corners`}, ${room.area.toFixed(2)} m² inside`
  if (room.basis === null || room.written === null) return inside
  const w = room.written.width === null ? 'stretched' : f2(room.written.width)
  const d = room.written.depth === null ? 'stretched' : f2(room.written.depth)
  if (room.basis === 'inside') return `${inside} (written ${w} x ${d} to the inside faces)`
  return `${inside} (written ${w} x ${d} to the ${TO[room.basis]})`
}

/** One line per problem, for a refusal. */
export function problemLines(result: RoomsResult): string[] {
  return result.problems.map((p) => `${p.code}: ${p.message}`)
}

/** The answer to a write, without the comparison with the plan before. */
export function roomsAnswer(result: RoomsResult, full = true): string[] {
  const lines: string[] = []
  const floors = new Set(result.rooms.map((r) => r.floor)).size
  // ARE-16: outdoor space and voids are no floor inside the building: listed, but not in the total.
  const total = result.rooms.reduce((sum, r) => sum + (r.apart === undefined ? r.area : 0), 0)
  const apart = result.rooms.filter((r) => r.apart !== undefined)
  const apartArea = apart.reduce((sum, r) => sum + r.area, 0)
  const derived = result.walls.length
  lines.push(
    `${floors} floor${floors === 1 ? '' : 's'}, ${result.rooms.length} room${result.rooms.length === 1 ? '' : 's'}; ${derived} wall${derived === 1 ? '' : 's'} and their kinds worked out; ${result.openings.length} opening${result.openings.length === 1 ? '' : 's'} placed; ${total.toFixed(2)} m² inside in all${apart.length === 0 ? '' : ` (not counting ${apart.length} outdoor or void room${apart.length === 1 ? '' : 's'}, ${apartArea.toFixed(2)} m²)`}.`
  )
  lines.push(`Sizes are to the ${TO[result.sizes.basis]}${result.sizes.stated ? '' : ' unless a room says otherwise (the default)'}.`)
  if (full) {
    lines.push('Rooms, inside faces east-west by north-south:')
    for (const room of result.rooms) lines.push(`  ${room.id} "${room.name}": ${sizeOf(room)}`)
    lines.push('Walls worked out (Grid derives these; change the rooms, not the walls):')
    for (const w of result.walls) {
      const what = w.virtual ? 'dividing line' : `${w.kind} ${w.thickness} m`
      lines.push(`  ${w.id}: ${what}, ${w.length.toFixed(2)} m, ${w.rooms.length === 1 ? `outside wall of ${w.rooms[0]}` : w.rooms.join(' | ')}`)
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
  for (const w of result.warnings) lines.push(`  ${w.code}: ${w.message}`)
  return lines
}
