/**
 * MSG-11: the language a command or a tool call writes in: the one asked for (`--lang`, the
 * `language` argument), else the plan's own (`display.language`), else English. Its messages
 * are loaded before anything is said in it.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, loadLanguage, readLanguage, type Language } from '@ongrid/floorplan/messages'
import { spokenIn } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { UsageError, type OptionSpecs } from './options'

export const LANG_OPTION: OptionSpecs = {
  '--lang': { takesValue: true, help: `The language Grid writes in: ${LANGUAGES.join(' or ')}. The plan's own display.language when left out, else en.` }
}

/** The language a word asks for, refused by name when Grid does not write it. `argument` names where it was given. */
export function askedLanguage(value: unknown, argument = '--lang'): Language | undefined {
  if (value === undefined) return undefined
  const language = readLanguage(value)
  if (language === null) throw new UsageError(`${argument} takes ${LANGUAGES.join(' or ')}: Grid does not write ${JSON.stringify(String(value))} yet.`)
  return language
}

/** The language to write in, with its messages loaded: the one asked for, else the plan's, else English. */
export async function languageFor(asked: Language | undefined, plan?: { readonly display?: { readonly language?: Language | undefined } | undefined }): Promise<Language> {
  const language = asked ?? plan?.display?.language ?? DEFAULT_LANGUAGE
  await loadLanguage(language)
  return language
}

/**
 * MSG-22: the plan as read in the language a command or a tool writes in, so the floor it names in
 * no list is named in that language (`spokenIn`). The plan as stated goes with it.
 */
export function spokenPlan<T extends { readonly plan: FloorPlan; readonly stated?: FloorPlan | undefined }>(loaded: T, language: Language): T {
  const plan = spokenIn(loaded.plan, language)
  if (plan === loaded.plan) return loaded
  return { ...loaded, plan, ...(loaded.stated === undefined ? {} : { stated: spokenIn(loaded.stated, language) }) }
}
