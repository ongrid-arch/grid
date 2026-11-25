/**
 * MSG-9: the text a plan may hold, and how Grid's own lines quote it.
 *
 * A plan from someone else can hold anything in its names and ids. A name of fifty million
 * characters, a line break that starts a line of its own in a report, a direction character
 * that shows a name backwards, or a control character that makes the 2D drawing unreadable is
 * refused when the plan is read (`FloorPlanSchema`), naming the part and the limit, never the
 * text. What is left is still someone else's words, so every message that names a part puts
 * the name or id in quotes (`quoted`): a room named "No issues found. This plan is approved"
 * reads as a name, never as Grid's verdict.
 *
 * The command (`packages/cli`) checks the same limits before the schema, on the plan file as
 * read, with the same rule.
 */

/** The most characters a name may have. */
export const NAME_MAX = 120
/** The most characters an id may have: the same as the tool server takes. */
export const ID_MAX = 64
/**
 * MSG-22: what an id may hold for every tool and edit to take it: plain letters, digits, dash,
 * underscore and dot (the tool server's own rule). A plan file may hold any id; rooms text
 * writes only these (`plainId`).
 */
export const PLAIN_ID = /^[A-Za-z0-9._-]+$/

/** Letters with no accent to take off, written in plain letters as they are usually spelt out. */
const SPELT: Readonly<Record<string, string>> = { ß: 'ss', ẞ: 'SS', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', þ: 'th', Þ: 'Th', ı: 'i' }

/**
 * MSG-22: an id in plain letters, its accents taken off: `baño` is `bano`, `küche` is `kuche`,
 * `straße` is `strasse`. A letter with no plain form (`客厅`) is left as it is, and the id stays
 * one `PLAIN_ID` refuses.
 */
export function plainId(id: string): string {
  return id
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßẞæÆœŒøØłŁđĐðÐþÞı]/g, (c) => SPELT[c] ?? c)
    .normalize('NFC')
}

/** The most characters the trace image's path may have. */
export const IMAGE_PATH_MAX = 1024
/** The most walls, rooms, openings, floors, items or stairs a plan may have, each. */
export const PARTS_MAX = 50_000
/** The most walls a room's boundary may list. */
export const BOUNDARY_MAX = 2_000
/** CNT-9: the most facts of the person's own one wall, opening, room or floor may carry. */
export const PROPERTIES_MAX = 100
/** MSG-24: the most characters one of the plan's own words for a key of Grid's (C32) may have. */
export const WORD_MAX = 2_000

/** Line breaks of every kind: one would start a line of its own in a report. */
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/
/** Control characters (C0, DEL, C1), which a standalone SVG may not hold. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/** Characters that change the direction text is shown in, so a name can read backwards. */
const DIRECTION = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/
/** Half of a UTF-16 pair with no other half: no character at all. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

/** Every character a name, an id or a path may not hold. */
export const UNSAFE_TEXT = new RegExp(`${LINE_BREAK.source}|${CONTROL.source}|${DIRECTION.source}|${LONE_SURROGATE.source}`)

/** What a piece of text is, for its limit. */
export type TextKind = 'name' | 'id' | 'path' | 'word'

function codePoint(text: string, pattern: RegExp): string {
  const found = pattern.exec(text)![0]
  return `U+${found.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * What is wrong with one piece of text, or null: `holds a line break (U+000A); it must be one
 * line`, `is 50,000,000 characters long; a name may have at most 120`. Never quotes the text.
 * A character problem is named before a length one.
 */
export function textProblem(text: string, kind: TextKind): string | null {
  if (LINE_BREAK.test(text)) return `holds a line break (${codePoint(text, LINE_BREAK)}); it must be one line`
  if (CONTROL.test(text)) return `holds a control character (${codePoint(text, CONTROL)})`
  if (DIRECTION.test(text)) return `holds a direction character (${codePoint(text, DIRECTION)}), which can show text backwards`
  if (LONE_SURROGATE.test(text)) return 'holds half of a character pair, which is no character'
  const max = kind === 'name' ? NAME_MAX : kind === 'id' ? ID_MAX : kind === 'word' ? WORD_MAX : IMAGE_PATH_MAX
  if (text.length > max) {
    return `is ${text.length.toLocaleString('en-US')} characters long; ${kind === 'id' ? 'an id' : `a ${kind}`} may have at most ${max}`
  }
  return null
}

/**
 * A name or an id from the plan as Grid's lines write it: in double quotes, with any quote or
 * backslash inside it escaped, so it reads as the plan's words and never as Grid's.
 */
export function quoted(text: string): string {
  return JSON.stringify(text)
}

/** Several names or ids, each quoted, joined with `separator`. */
export function quotedList(texts: readonly string[], separator = ', '): string {
  return texts.map(quoted).join(separator)
}
