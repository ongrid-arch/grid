/**
 * LVL-25: rooms numbered by their floor. `{level}`, or `{floor}`, in a room's or a flat's name and in
 * a placement's label is the floor's level, so `repeat guest 6 east as {level}01 ...` places 101 to
 * 106 on level 1 and 201 to 206 on a copy of it on level 2.
 *
 * A label is counted from what was written and then filled (`{level}01`, `{level}02`), so the count
 * never runs into the level's own digits. Pure: words in, words out.
 */

/** The marks a floor's level is written by. */
export const LEVEL_MARKS = ['{level}', '{floor}'] as const

/** Whether a word holds one of the marks. */
export function hasLevelMark(text: string): boolean {
  return LEVEL_MARKS.some((mark) => text.includes(mark))
}

/** A level as a label writes it: `2`, `0`, `-1`, `0.5`. */
export function levelWord(level: number): string {
  return String(level)
}

/** The text with every mark filled with the floor's level. */
export function withLevel(text: string, level: number): string {
  let out = text
  for (const mark of LEVEL_MARKS) out = out.split(mark).join(levelWord(level))
  return out
}

/**
 * The k-th label of a row (k from 0), as written before its level is filled (WRT-55): counting up
 * from its last digits and keeping their width (`301`, `302`; `A7`, `A8`; `{level}01`, `{level}02`),
 * else the label with a number after it (`A1`, `A2`) when the row places more than one.
 */
export function countedLabel(label: string, k: number, count: number): string {
  const digits = /^(.*?)(\d+)$/.exec(label)
  if (digits !== null) return `${digits[1]}${String(Number(digits[2]) + k).padStart(digits[2]!.length, '0')}`
  return count > 1 ? `${label}${k + 1}` : label
}
