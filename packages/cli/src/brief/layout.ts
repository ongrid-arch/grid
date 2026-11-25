/**
 * BRF-6: a first layout from the brief beside the plan (BRF-1): its rooms with their sizes, and
 * the rooms it wants to touch, packed by `layOut` into rooms text and written through rooms-first
 * writing (WRT-2), so the plan is an ordinary plan written from rooms text. Each size not kept is
 * said in the brief's own words ("asked 2.4 x 3, drawn 2.40 x 3.20 m") and by how much.
 *
 * `grid_write_rooms layout=tidy|sizes` and `grid write --layout tidy|sizes` both come here. The
 * plan is written as any rooms text is: over a plan written some other way only with `replace`.
 */
import { layOut, LayoutRefused, type Layout, type LayoutRoom, type LayoutShape, type PlacedRoom } from '@ongrid/floorplan/rooms'
import type { Project } from '../fs/projectFiles'
import { RoomsRefused, writeRoomsIntoProject, type WriteDone } from '../command/write'
import { readBrief, type Brief } from './brief'

/** A size not kept, in the brief's words, and by how much its area changed (m², more when above 0). */
export interface NotKept {
  readonly room: string
  readonly name: string
  readonly text: string
  readonly by: number
}

export interface LayoutData {
  readonly shape: LayoutShape
  /** The rooms text written: change it and write it again with grid_write_rooms. */
  readonly rooms: string
  /** East-west by north-south, inside the outside walls, m. */
  readonly outline: readonly [number, number]
  /** The hall Grid added, by name, or null. */
  readonly added: string | null
  readonly notKept: readonly NotKept[]
  /** The rooms of the brief that were not placed, each with why. */
  readonly notPlaced: readonly string[]
  readonly touch: { readonly wished: number; readonly held: number }
}

const q = (text: string): string => JSON.stringify(text)
const n2 = (v: number): string => v.toFixed(2)

/** The brief's rooms as a list to place, and the ones that can't be, with why. */
function roomsOf(brief: Brief): { rooms: LayoutRoom[]; hall: LayoutRoom | null; notPlaced: string[] } {
  const rooms: LayoutRoom[] = []
  const notPlaced: string[] = []
  let hall: LayoutRoom | null = null
  const add = (room: LayoutRoom): void => {
    if (room.name.includes('"') && room.name.includes("'")) notPlaced.push(`${q(room.name)}: its name holds both kinds of quote, which rooms text cannot write.`)
    else if (room.inside === null && room.area === null) notPlaced.push(`${q(room.name)}: no size asked. Give it an area or an inside size in the brief.`)
    else if (room.use === 'corridor' && hall === null) hall = room
    else rooms.push(room)
  }
  const wishes = brief.rooms.filter((wish) => wish.level !== 'avoid' && wish.count !== 0 && wish.countAtMost !== 0)
  const sized = (wish: Brief['rooms'][number]): Pick<LayoutRoom, 'inside' | 'area'> => ({ inside: wish.inside, area: wish.inside !== null ? null : (wish.area ?? wish.atLeast ?? wish.atMost) })
  for (const wish of wishes) {
    if (wish.name === null) continue
    for (let k = 0; k < (wish.count ?? wish.countAtLeast ?? 1); k++) add({ name: wish.name, use: wish.use, ...sized(wish) })
  }
  for (const wish of wishes) {
    if (wish.name !== null || wish.use === null) continue
    const label = wish.use.charAt(0).toUpperCase() + wish.use.slice(1)
    const names = new Set([...rooms, ...(hall === null ? [] : [hall])].map((r) => r.name.toLowerCase()))
    let n = 1
    for (let k = [...rooms].filter((r) => r.use === wish.use).length; k < (wish.count ?? wish.countAtLeast ?? 1); k++) {
      while (names.has(`${label} ${n}`.toLowerCase())) n++
      names.add(`${label} ${n}`.toLowerCase())
      add({ name: `${label} ${n}`, use: wish.use, ...sized(wish) })
    }
  }
  return { rooms, hall, notPlaced }
}

/** The area a room was asked to have, m². */
const askedArea = (room: LayoutRoom): number => (room.inside !== null ? room.inside[0] * room.inside[1] : room.area!)

/**
 * Writes a first layout of the brief beside `planFile` into it. Refused with `RoomsRefused` when
 * there is no brief, it can't be read, or it holds no room to place; and as any rooms text is.
 */
export function writeLayout(project: Project, planFile: string, shape: LayoutShape, options: { readonly replace?: boolean; readonly brief?: boolean } = {}): { readonly done: WriteDone; readonly layout: LayoutData; readonly lines: readonly string[] } {
  // The plan's own path first, so a refusal names it, not the brief's beside it.
  project.resolve(planFile)
  const read = readBrief(project, planFile)
  if (read.problem !== null) throw new RoomsRefused('rooms/no-brief', `No first layout was written: the brief beside the plan can't be read (${read.problem}).`)
  if (read.brief === null) throw new RoomsRefused('rooms/no-brief', `No first layout was written: there is no brief beside the plan (${q(read.file)}). Write what the person asked for there first (grid_write_brief writes it), the rooms with their sizes; the layout is made from them.`)
  const { rooms, hall, notPlaced } = roomsOf(read.brief)
  let layout: Layout
  try {
    layout = layOut({ rooms, hall, touch: read.brief.touch.map((wish) => ({ rooms: wish.rooms, level: wish.level })), shape })
  } catch (error) {
    if (error instanceof LayoutRefused) throw new RoomsRefused('rooms/layout', `No first layout was written: ${error.message}.${notPlaced.length > 0 ? ` Not placed: ${notPlaced.join(' ')}` : ''}`)
    throw error
  }
  const done = writeRoomsIntoProject(project, layout.text, planFile, options)

  // Each size not kept, in the brief's line for it, and by how much.
  const notKept: NotKept[] = layout.rooms.filter((p) => !p.kept).flatMap((p: PlacedRoom) => {
    const by = p.width * p.depth - askedArea(p.index === null ? hall! : rooms[p.index]!)
    return done.brief.lines
      .filter((line) => line.wish === 'room' && line.asked !== null && line.drawn !== null && line.parts.some((part) => part.id === p.id))
      .map((line) => ({ room: p.id, name: p.name, by: Math.round(by * 100) / 100, text: `${line.text.replace(/\.$/, '')}: ${n2(Math.abs(by))} m² ${by >= 0 ? 'more' : 'less'}.` }))
  })
  const placed = layout.rooms.filter((p) => p.row !== 'hall').length
  const rows = layout.rooms.some((p) => p.row === 'north') ? 'two rows' : 'one row'
  const hallName = layout.rooms.find((p) => p.row === 'hall')
  const lines = [
    `First layout from the brief (${q(read.file)}): ${placed} room${placed === 1 ? '' : 's'} in ${rows}${hallName === undefined ? '' : ` along ${q(hallName.name)}`}, ${n2(layout.outline[0])} x ${n2(layout.outline[1])} m inside the outside walls, ${shape === 'tidy' ? 'in a rectangle' : 'every size kept, the outline stepping'}. It places no door or window: add them to the rooms text.`,
    ...(layout.added === null ? [] : [`Added ${q(layout.added.name)}, ${n2(layout.added.depth)} m wide (Grid's own size, not a code figure): the brief names no corridor for the rooms to stand along.`]),
    ...(layout.touch.wished === 0 ? [] : [`Rooms the brief wants to touch or not: ${layout.touch.held} of ${layout.touch.wished} wishes hold.`]),
    ...(notKept.length === 0 ? ['Every size asked for is kept.'] : [`Sizes not kept (${notKept.length}):`, ...notKept.map((x) => `  ${x.text}`)]),
    ...(notPlaced.length === 0 ? [] : [`Not placed (${notPlaced.length}):`, ...notPlaced.map((x) => `  ${x}`)]),
    'The rooms text written, to change and write again:',
    ...layout.text.trimEnd().split('\n').map((line) => `  ${line}`),
  ]
  const data: LayoutData = { shape, rooms: layout.text, outline: layout.outline, added: layout.added?.name ?? null, notKept, notPlaced, touch: layout.touch }
  return { done, layout: data, lines: [...done.lines, ...lines] }
}
