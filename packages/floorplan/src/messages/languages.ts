/**
 * MSG-11: the languages Grid writes in, and how far each has been checked.
 *
 * English is the source: every key is written in it first (`en.ts`). Another language is one
 * file with the same keys (`es.ts`), and starts as a draft no person has checked. A language is
 * marked reviewed only when a named person, an architect for the building terms, has read every
 * line of it; an AI is never recorded as that person.
 *
 * MSG-24: Grid writes in any language. A language Grid ships no file for is written in the
 * plan's own words for it (`display.words`, C32, supplied by the agent), and in English where the
 * plan gives none (`words.ts`).
 *
 * Pure: words in, words out.
 */

/** The languages Grid ships a file of its words for. */
export const LANGUAGES = ['en', 'es'] as const
export type ShippedLanguage = (typeof LANGUAGES)[number]

/**
 * MSG-24: a language Grid may write in: the primary subtag of a BCP-47 tag, in lower case (`de`,
 * `pt`, `zh`), as `readLanguage` reads it. The shipped ones have a file; any other is written in
 * the plan's own words for it, else in English.
 */
export type Language = string

export const DEFAULT_LANGUAGE: ShippedLanguage = 'en'

/**
 * How far each language's file has been checked. `source`: the language the keys are written
 * in. `draft translation, not reviewed`: written from the English, and read by no person yet.
 */
export const LANGUAGE_STATUS: Readonly<Record<ShippedLanguage, 'source' | 'draft translation, not reviewed' | 'reviewed'>> = {
  en: 'source',
  es: 'draft translation, not reviewed'
}

/** The decimal mark a shipped language writes when the plan's display does not choose one. */
export const LANGUAGE_DECIMAL: Readonly<Record<ShippedLanguage, 'point' | 'comma'>> = {
  en: 'point',
  es: 'comma'
}

/** Whether Grid ships a file of its words for the language. */
export function isLanguage(value: unknown): value is ShippedLanguage {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * MSG-24: the decimal mark a language writes when the display does not choose one: a shipped
 * language's own, else a point. It never comes from the plan's words.
 */
export function languageDecimal(language: Language): 'point' | 'comma' {
  return isLanguage(language) ? LANGUAGE_DECIMAL[language] : 'point'
}

/** A well-formed BCP-47 tag: a primary subtag of two or three letters, then any subtags. */
const TAG = /^([A-Za-z]{2,3})(?:[-_][A-Za-z0-9]{1,8})*$/

/**
 * The language a word names, for an option or an argument: `es`, `ES`, and a tag with a region,
 * `es-MX`, are all Spanish; MSG-24: any well-formed BCP-47 tag is its primary language, `pt-BR`
 * is `pt`. Null when the word is no language tag.
 */
export function readLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null
  const tag = TAG.exec(value.trim())
  return tag === null ? null : tag[1]!.toLowerCase()
}

/**
 * MSG-22: the name of the floor a plan with no floor list stands on (C5), in each language: the
 * plan's language names it, and a floor the plan names keeps its own name. The Spanish is a draft
 * translation, not reviewed, as the rest of `es.ts` is.
 */
export const GROUND_FLOOR_NAME: Readonly<Record<ShippedLanguage, string>> = {
  en: 'Ground floor',
  es: 'Planta baja'
}
