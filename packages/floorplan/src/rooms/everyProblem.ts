/**
 * MSG-33: every independent problem of a rooms text, not only the first. The compiler
 * (`compile.ts`) stops at the first line it cannot read, so a text with five mistakes is refused
 * with one, and the agent learns the next only by sending it again. Here a refused text's
 * problem lines are set aside (each made a blank line, so every line keeps its number) and the
 * text is written again, round by round, gathering each new problem.
 *
 * A new problem that an earlier one caused is left out, and its line set aside with it: its line,
 * or a line its message names, holds the id of a room already set aside (a room placed north of a
 * refused room, a door into it). It is put right by putting the first right. Only lines that
 * write one part are set aside; a problem on any other line (`floor`, `walls`, `unit`, `end`, or
 * none) ends the search with what was found, since every line after it could read differently.
 */
import { compileRoomsText, type CompileOptions, type RoomsProblem, type RoomsResult } from './compile'

/** The most times a text is written again to find its next problems. */
export const EVERY_PROBLEM_ROUNDS = 12

/** The lines that write one part, which can be set aside and leave the others reading as they did. */
const SET_ASIDE_WORDS: ReadonlySet<string> = new Set(['room', 'wall', 'door', 'window', 'opening', 'item'])

function firstWord(line: string): string {
  return line.trim().split(/\s+/, 1)[0] ?? ''
}

function wordsIn(line: string): string[] {
  return line.split(/[\s,()]+/).filter((word) => word !== '')
}

/** The lines a problem is about: its own and every line its message names. */
function linesOf(problem: RoomsProblem): number[] {
  const named = [...problem.message.matchAll(/\bline (\d+)/gi)].map((m) => Number(m[1]))
  return [...new Set([...(problem.line === null ? [] : [problem.line]), ...named])]
}

const keyOf = (problem: RoomsProblem): string => `${problem.code}|${problem.line ?? ''}|${problem.message}`

/**
 * The result of writing `text`, with every independent problem when it is refused. A text that
 * writes comes back as the compiler gave it, and so does the first result's plan, warnings and
 * facts: only `problems` grows, in line order (problems with no line last).
 */
export function everyProblem(text: string, first: RoomsResult, options: CompileOptions = {}): RoomsResult {
  if (first.plan !== null || first.problems.length === 0) return first
  const lines = text.split(/\r\n|\r|\n/)
  const found = new Map<string, RoomsProblem>(first.problems.map((p) => [keyOf(p), p]))
  const asideIds = new Set<string>()
  const setAside = (at: number): boolean => {
    const line = lines[at - 1]
    if (line === undefined) return false
    if (line.trim() === '') return true
    if (!SET_ASIDE_WORDS.has(firstWord(line))) return false
    const words = wordsIn(line)
    if (words[0] === 'room' && words[1] !== undefined) asideIds.add(words[1])
    lines[at - 1] = ''
    return true
  }
  /** Whether a problem names a room set aside, on its lines or in its message. */
  const caused = (problem: RoomsProblem): boolean =>
    [...asideIds].some((id) => problem.message.includes(`'${id}'`))
    || linesOf(problem).some((at) => wordsIn(lines[at - 1] ?? '').some((word) => asideIds.has(word)))
  let fresh: readonly RoomsProblem[] = first.problems
  for (let round = 0; round < EVERY_PROBLEM_ROUNDS; round++) {
    if (fresh.some((p) => p.line === null)) break
    if (!fresh.every((p) => setAside(p.line!))) break
    const again = compileRoomsText(lines.join('\n'), options)
    if (again.plan !== null) break
    const unseen = again.problems.filter((p) => !found.has(keyOf(p)))
    if (unseen.length === 0) break
    // Caused by a line set aside: set aside too, never listed. The others are new problems.
    const own = unseen.filter((p) => !caused(p))
    for (const p of own) found.set(keyOf(p), p)
    fresh = unseen
  }
  const problems = [...found.values()].map((p, i) => ({ p, i })).sort((a, b) => (a.p.line ?? Infinity) - (b.p.line ?? Infinity) || a.i - b.i).map(({ p }) => p)
  return { ...first, problems }
}
