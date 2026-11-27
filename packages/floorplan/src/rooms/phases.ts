/**
 * WRT-81 (C16): existing, demolished and new in rooms text.
 *
 * `phase <existing|demolished|new>` on a room, door, window, opening, `place` or `repeat` line
 * says the part's phase; alone on a line it sets the phase of the room and opening lines after
 * it, until the next such line. On a `wall` line it sets that wall's phase, whatever its rooms
 * give it. Every other line stands after the work, as it does in a plan with phases (CNT-10).
 *
 * A phased text is written twice, as the building stands before the work (its existing and
 * demolished lines) and after it (existing and new), by the one-state compiler, each state with
 * the lines of the other made blank so every line keeps its number. An opening, wall, rename or
 * remove line with no phase of its own that names a room the state leaves out is left out of it
 * too: a door into a room to be demolished goes with it. The two plans are then made one
 * (`mergeStates`): a part in both, the same, is existing; one only before is to be demolished;
 * one only after is new. A wall the two states give other ids at the very same place is one
 * existing wall under its id after the work, so the wall between a room that stays and one
 * rebuilt the same size is kept. A part with one id and two shapes keeps its id after the work,
 * new, and the one before is `<id>-before`, to be demolished, as Grid's edits do
 * (`cli/src/edit/phases.ts`, WRT-15). An opening in both states states only what its line
 * states, so it goes with its wall.
 *
 * A text with no phase word is not phased and is written as it always was. A fit-out (`base`) is
 * the work itself, so it takes none. Pure: text in, a plan and a report out.
 */
import type { Opening, Phase, Room } from '../types/floorplan'
import { english, name, said } from '../messages/say'
import { baseNamedIn } from './base'
import { wordsOf } from './words'
import type { CompileOptions, DerivedWallFacts, RoomsProblem, RoomsResult, WrittenPlan } from './compile'

type State = 'before' | 'after'

/** The phases a line may state. */
export const PHASE_LINE_WORDS: readonly Phase[] = ['existing', 'demolished', 'new']

/** The lines a phase goes on, by their first word: they write one room or opening, or place rooms. */
const PART_LINES: ReadonlySet<string> = new Set(['room', 'door', 'window', 'opening', 'place', 'repeat'])

/** The lines left out of a state that leaves out a room they name, by their first word. */
const NAMING_LINES: ReadonlySet<string> = new Set(['door', 'window', 'opening', 'wall', 'rename', 'remove'])

/** The words a room's id follows on a line that names rooms, so `between phase and hall` names a room called phase. */
const BEFORE_ID: ReadonlySet<string> = new Set(['between', 'and', 'of', 'in', 'into', 'until', 'near', 'inside', 'open', 'wall', 'room', 'door', 'window', 'opening', 'rename', 'remove', 'as', 'place', 'repeat', 'from'])

const stands = (phase: Phase, state: State): boolean => (state === 'before' ? phase !== 'new' : phase !== 'demolished')

/** One line of a phased text, as each state reads it. */
interface PhaseLine {
  /** The line without its phase words. */
  readonly text: string
  /** The phase the line states, or the one a phase line above it sets; null for a line that takes none. */
  readonly phase: Phase | null
  /** The words taken out (`phase new`), so a fix offered for the line can keep them. */
  readonly said: string | null
  /** A phase line on its own: blank in both states. */
  readonly alone: boolean
  /** The first word, and the room ids the line names. */
  readonly first: string
  readonly names: readonly string[]
  /** A room line's id. */
  readonly room: string | null
}

/** A phased text, line by line, and what is wrong with its phase words. */
export interface PhasedText {
  readonly lines: readonly PhaseLine[]
  readonly problems: readonly RoomsProblem[]
}

/** The line with every character in quotes, and all after a comment, masked, so a phase word in a name is not read. */
function masked(line: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote !== null) {
      if (c === '\\' && (line[i + 1] === '"' || line[i + 1] === "'")) {
        out += '\u0001\u0001'
        i++
        continue
      }
      if (c === quote) quote = null
      out += '\u0001'
      continue
    }
    // A foot or inch mark after a digit is no quote (`words.ts`).
    if ((c === '"' || c === "'") && /[0-9]$/.test(line.slice(0, i))) {
      out += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      out += '\u0001'
      continue
    }
    if (c === '#') return out + '\u0001'.repeat(line.length - i)
    out += c
  }
  return out
}

const PHASE_WORD = /(^|[\s,])phase\s+([^\s,]+),?(?=\s|$)/g

/** The room ids a line names, after the words a room's id follows. */
function namesOf(words: readonly string[]): string[] {
  const out: string[] = []
  const first = words[0] ?? ''
  if (first === 'wall') {
    if (words[1] === 'between') out.push(words[2] ?? '', words[4] ?? '')
    else out.push(words[1] ?? '')
  } else if (first === 'rename' || first === 'remove') out.push(words[1] ?? '')
  else for (let i = 1; i < words.length - 1; i++) if (words[i] === 'between' || words[i] === 'and' || words[i] === 'in' || words[i] === 'into') out.push(words[i + 1]!)
  return out.filter((id) => id !== '')
}

/** The text's phase words, or null when it states none: then it is written as one state. */
export function phasedText(text: string): PhasedText | null {
  const source = text.split(/\r\n|\r|\n/)
  const lines: PhaseLine[] = []
  const problems: RoomsProblem[] = []
  let any = false
  let current: Phase | null = 'existing'
  source.forEach((line, i) => {
    const at = i + 1
    const plain = masked(line)
    const found = [...plain.matchAll(PHASE_WORD)]
    let words: string[] = []
    try {
      words = wordsOf(line, at)
    } catch {
      // The compiler refuses a line it cannot read, in its own words.
    }
    const first = words[0] ?? ''
    if (first === 'phase') {
      any = true
      const word = words[1] ?? ''
      if (words.length !== 2) problems.push({ code: 'rooms/phase', line: at, message: english(said('rooms.phase.alone', { line: at })) })
      else if (!PHASE_LINE_WORDS.includes(word as Phase)) problems.push({ code: 'rooms/phase', line: at, message: english(said('rooms.phase.unknown', { line: at, word: name(word) })) })
      else current = word as Phase
      lines.push({ text: '', phase: null, said: null, alone: true, first, names: [], room: null })
      return
    }
    // A phase word is `phase` with one of the three after it, or anything after it where no room's id would stand.
    const meant = found.filter((m) => {
      const before = wordsOfMasked(plain.slice(0, m.index + m[1]!.length)).at(-1) ?? ''
      return PHASE_LINE_WORDS.includes(m[2] as Phase) || !BEFORE_ID.has(before)
    })
    let stated: Phase | null = null
    let kept = line
    let saidWords: string | null = null
    if (meant.length > 0) {
      any = true
      const takes = PART_LINES.has(first) || first === 'wall'
      for (const m of meant) {
        if (!PHASE_LINE_WORDS.includes(m[2] as Phase)) problems.push({ code: 'rooms/phase', line: at, message: english(said('rooms.phase.unknown', { line: at, word: name(m[2]!) })) })
        else stated = m[2] as Phase
      }
      if (!takes) problems.push({ code: 'rooms/phase', line: at, message: english(said('rooms.phase.where', { line: at, kind: first })) })
      // Taken out from the last, so the places of the earlier ones hold.
      for (const m of [...meant].reverse()) {
        const start = m.index + m[1]!.length
        kept = kept.slice(0, start) + kept.slice(m.index + m[0].length)
      }
      saidWords = stated === null ? null : `phase ${stated}`
    }
    let rest = words
    if (meant.length > 0) {
      try {
        rest = wordsOf(kept, at)
      } catch {
        rest = words
      }
    }
    const phase = first === 'wall' ? stated : PART_LINES.has(first) ? (stated ?? current) : null
    lines.push({ text: kept, phase, said: saidWords, alone: false, first, names: NAMING_LINES.has(first) ? namesOf(rest) : [], room: first === 'room' ? (rest[1] ?? null) : null })
  })
  return any ? { lines, problems } : null
}

/** The words of a masked stretch of line. */
const wordsOfMasked = (text: string): string[] => text.split(/[\s,]+/).filter((w) => w !== '')

/** Whether a line stands in a state, by its own phase or the one above it; a wall line's phase is said after. */
function inState(line: PhaseLine, state: State, gone: ReadonlySet<string>, stated: boolean): boolean {
  if (line.alone) return false
  if (line.phase !== null && line.first !== 'wall' && !stands(line.phase, state)) return false
  // A line that names a room the state leaves out goes with it, unless the line states its own phase.
  if (!stated && line.names.some((id) => gone.has(id))) return false
  return true
}

/** The text as one state reads it: the other state's lines blank, and no phase words. */
export function stateText(phased: PhasedText, state: State): string {
  const gone = new Set<string>()
  for (const line of phased.lines) if (line.room !== null && line.phase !== null && !stands(line.phase, state)) gone.add(line.room)
  // A room written in both phases (a room rebuilt under its own id) stands in each.
  for (const line of phased.lines) if (line.room !== null && line.phase !== null && stands(line.phase, state)) gone.delete(line.room)
  return phased.lines.map((line) => (inState(line, state, gone, line.said !== null && line.first !== 'wall') ? line.text : '')).join('\n')
}

// ---------------------------------------------------------------------------------------------
// The two states made one plan

/** A part as text, its keys in order, without its id and phase: two parts alike in every other way are the same. */
function shape(part: object, without: readonly string[] = ['id', 'phase']): string {
  const order = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(order)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
          .sort()
          .map((key) => [key, order((value as Record<string, unknown>)[key])])
      )
    }
    return value
  }
  const rest: Record<string, unknown> = { ...(part as Record<string, unknown>) }
  for (const key of without) delete rest[key]
  return JSON.stringify(order(rest))
}

/** An id no part uses: `<id>-before`, then `<id>-before-2` and on. */
function freeId(taken: Set<string>, id: string): string {
  let next = `${id}-before`
  for (let n = 2; taken.has(next); n++) next = `${id}-before-${n}`
  taken.add(next)
  return next
}

/** The one plan, and each before-state wall's id in it. */
export interface MergedStates {
  readonly plan: WrittenPlan
  readonly walls: ReadonlyMap<string, string>
}

/** The two states as one plan with phases (see the header). */
export function mergeStates(before: WrittenPlan, after: WrittenPlan): MergedStates {
  const taken = new Set<string>([...before.walls, ...before.rooms, ...before.openings, ...after.walls, ...after.rooms, ...after.openings].map((p) => p.id))
  const afterIds = new Set([...after.walls, ...after.rooms, ...after.openings].map((p) => p.id))
  const keepOrFree = (id: string): string => (afterIds.has(id) ? freeId(taken, id) : id)

  // Walls: by id, then by place, then each in its one state.
  const rename = new Map<string, string>()
  const kept = new Set<string>()
  const beforeById = new Map(before.walls.map((w) => [w.id, w]))
  for (const wall of after.walls) {
    const was = beforeById.get(wall.id)
    if (was !== undefined && shape(was) === shape(wall)) {
      rename.set(was.id, wall.id)
      kept.add(wall.id)
    }
  }
  const pool = new Map<string, string[]>()
  for (const wall of before.walls) {
    if (rename.has(wall.id)) continue
    const key = shape(wall)
    pool.set(key, [...(pool.get(key) ?? []), wall.id])
  }
  for (const wall of after.walls) {
    if (kept.has(wall.id)) continue
    const was = pool.get(shape(wall))?.shift()
    if (was === undefined) continue
    rename.set(was, wall.id)
    kept.add(wall.id)
  }
  const gone = before.walls.filter((w) => !rename.has(w.id))
  for (const wall of gone) rename.set(wall.id, keepOrFree(wall.id))
  const walls = [
    ...after.walls.map((w) => ({ ...w, phase: w.phase ?? (kept.has(w.id) ? 'existing' : 'new') })),
    ...gone.map((w) => ({ ...w, id: rename.get(w.id)!, phase: w.phase ?? ('demolished' as const) })),
  ]
  const wallOf = (id: string): string => rename.get(id) ?? id

  // Rooms and openings: the same in both by id, after the walls before the work take their ids.
  const roomBefore = before.rooms.map((r): Room => ({ ...r, boundary: r.boundary.map(wallOf), ...(r.holes === undefined ? {} : { holes: r.holes.map((hole) => hole.map(wallOf)) }) }))
  const rooms = pair(roomBefore, after.rooms, keepOrFree, (r, phase) => ({ ...r, phase: r.phase ?? phase }), true)
  const openingBefore = before.openings.map((o): Opening => ({ ...o, wall: wallOf(o.wall) }))
  const openings = pair(openingBefore, after.openings, keepOrFree, (o, phase) => (phase === 'existing' ? o : { ...o, phase: o.phase ?? phase }), false)
  return { plan: { ...after, walls, rooms, openings }, walls: rename }
}

/** Parts of the two states made one list: the same in both, existing; else each in its one state. */
function pair<T extends { id: string; phase?: Phase | undefined }>(before: readonly T[], after: readonly T[], keepOrFree: (id: string) => string, inPhase: (part: T, phase: Phase) => T, statesExisting: boolean): T[] {
  const beforeById = new Map(before.map((p) => [p.id, p]))
  const same = new Set<string>()
  for (const part of after) {
    const was = beforeById.get(part.id)
    if (was !== undefined && shape(was) === shape(part)) same.add(part.id)
  }
  return [
    ...after.map((p) => (same.has(p.id) ? (statesExisting ? inPhase(p, 'existing') : p) : inPhase(p, 'new'))),
    ...before.filter((p) => !same.has(p.id)).map((p) => inPhase({ ...p, id: keepOrFree(p.id) }, 'demolished')),
  ]
}

// ---------------------------------------------------------------------------------------------
// Writing a phased text

/** A problem or warning of one state that the other does not have says which state it is. */
function inOneState(before: readonly RoomsProblem[], after: readonly RoomsProblem[], phased: PhasedText): RoomsProblem[] {
  const key = (p: RoomsProblem): string => `${p.code}|${p.line ?? ''}|${p.message}`
  const inAfter = new Set(after.map(key))
  const inBefore = new Set(before.map(key))
  const keepWords = (p: RoomsProblem): RoomsProblem => {
    if (p.fixes === undefined) return p
    return { ...p, fixes: p.fixes.map((fix) => ({ ...fix, text: phased.lines[fix.line - 1]?.said == null ? fix.text : `${fix.text} ${phased.lines[fix.line - 1]!.said}` })) }
  }
  const told = (p: RoomsProblem, state: State): RoomsProblem => ({ ...keepWords(p), message: english(said(state === 'before' ? 'rooms.phase.state.before' : 'rooms.phase.state.after', { problem: p.message })) })
  const out: RoomsProblem[] = []
  const seen = new Set<string>()
  for (const p of after) {
    if (seen.has(key(p))) continue
    seen.add(key(p))
    out.push(inBefore.has(key(p)) ? keepWords(p) : told(p, 'after'))
  }
  for (const p of before) {
    if (inAfter.has(key(p)) || seen.has(`b|${key(p)}`)) continue
    seen.add(`b|${key(p)}`)
    out.push(told(p, 'before'))
  }
  return out.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
}

/** The walls a wall line names, by the statements the writing gives each wall (`handles`). */
function wallsNamed(line: string, facts: readonly DerivedWallFacts[]): string[] {
  let words: string[]
  try {
    words = wordsOf(line, 0)
  } catch {
    return []
  }
  const handles: string[] = []
  if (words[1] === 'between') {
    const [a, b, side] = [words[2], words[4], words[5]]
    const sides = side !== undefined && /^(north|south|east|west)(\.\d+)?$/.test(side) ? [` ${side}`, ''] : ['']
    for (const s of sides) handles.push(`wall between ${a} and ${b}${s}`, `wall between ${b} and ${a}${s}`)
  } else handles.push(`wall ${words[1]} ${words[2]}`)
  for (const handle of handles) {
    const ids = facts.filter((w) => w.handles.includes(handle)).map((w) => w.id)
    if (ids.length > 0) return ids
  }
  return []
}

/**
 * A phased text written: both states, made one plan, each wall line's own phase on its wall.
 * `compile` is the one-state compiler, passed in so this file does not import it.
 */
export function compilePhased(text: string, phased: PhasedText, options: CompileOptions, compile: (text: string, options: CompileOptions) => RoomsResult): RoomsResult {
  const base = baseNamedIn(text)
  const refused = base === null ? phased.problems : [...phased.problems, { code: 'rooms/phase', line: base.line, message: english(said('rooms.phase.base', { line: base.line })) }]
  const after = compile(stateText(phased, 'after'), options)
  if (refused.length > 0) return { ...after, plan: null, problems: [...refused].sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity)) }
  const before = compile(stateText(phased, 'before'), options)
  const warnings = inOneState(before.warnings, after.warnings, phased)
  if (before.plan === null || after.plan === null) return { ...after, plan: null, problems: inOneState(before.problems, after.problems, phased), warnings }
  const merged = mergeStates(before.plan, after.plan)
  // A wall line's own phase is its wall's, in whichever state the line is read.
  const phaseOf = new Map<string, Phase>()
  phased.lines.forEach((line) => {
    if (line.first !== 'wall' || line.phase === null) return
    for (const id of wallsNamed(line.text, after.walls)) phaseOf.set(id, line.phase)
    for (const id of wallsNamed(line.text, before.walls)) phaseOf.set(merged.walls.get(id) ?? id, line.phase)
  })
  const plan: WrittenPlan = phaseOf.size === 0 ? merged.plan : { ...merged.plan, walls: merged.plan.walls.map((w) => (phaseOf.has(w.id) ? { ...w, phase: phaseOf.get(w.id)! } : w)) }
  const afterWalls = new Set(after.walls.map((w) => w.id))
  const afterRooms = new Set(after.rooms.map((r) => r.id))
  return {
    ...after,
    plan,
    warnings,
    rooms: [...after.rooms, ...before.rooms.filter((r) => !afterRooms.has(r.id))],
    walls: [...after.walls, ...before.walls.map((w) => ({ ...w, id: merged.walls.get(w.id) ?? w.id })).filter((w) => !afterWalls.has(w.id))],
    openings: [...new Set([...after.openings, ...before.openings])],
  }
}
