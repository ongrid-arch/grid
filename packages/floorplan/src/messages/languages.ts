/**
 * MSG-11: the languages Grid writes in, and how far each has been checked.
 *
 * English is the source: every key is written in it first (`en.ts`). Another language is one
 * file with the same keys (`es.ts`), and starts as a draft no person has checked. A language is
 * marked reviewed only when a named person, an architect for the building terms, has read every
 * line of it; an AI is never recorded as that person.
 *
 * Pure: words in, words out.
 */

export const LANGUAGES = ['en', 'es'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

/**
 * How far each language's file has been checked. `source`: the language the keys are written
 * in. `draft translation, not reviewed`: written from the English, and read by no person yet.
 */
export const LANGUAGE_STATUS: Readonly<Record<Language, 'source' | 'draft translation, not reviewed' | 'reviewed'>> = {
  en: 'source',
  es: 'draft translation, not reviewed'
}

/** The decimal mark a language writes when the plan's display does not choose one. */
export const LANGUAGE_DECIMAL: Readonly<Record<Language, 'point' | 'comma'>> = {
  en: 'point',
  es: 'comma'
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * The language a word names, for an option or an argument: `es`, `ES`, and a tag with a region,
 * `es-MX`, are all Spanish. Null when Grid does not write that language.
 */
export function readLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null
  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return isLanguage(base) ? base : null
}

/**
 * MSG-22: the name of the floor a plan with no floor list stands on (C5), in each language: the
 * plan's language names it, and a floor the plan names keeps its own name. The Spanish is a draft
 * translation, not reviewed, as the rest of `es.ts` is.
 */
export const GROUND_FLOOR_NAME: Readonly<Record<Language, string>> = {
  en: 'Ground floor',
  es: 'Planta baja'
}
