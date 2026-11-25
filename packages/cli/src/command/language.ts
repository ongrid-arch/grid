/**
 * MSG-11: the language a command or a tool call writes in: the one asked for (`--lang`, the
 * `language` argument), else the plan's own (`display.language`), else English. Its messages
 * are loaded before anything is said in it. MSG-24: any language, written in the plan's own words
 * for it (`display.words`), else in the file Grid ships for it, else in English.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, loadLanguage, readLanguage, usePlanWords, type Language } from '@ongrid/floorplan/messages'
import { spokenIn } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { UsageError, type OptionSpecs } from './options'

export const LANG_OPTION: OptionSpecs = {
  '--lang': { takesValue: true, help: `The language Grid writes in, as a language tag (${LANGUAGES.join(', ')}, de, pt-BR): in the plan's own words for it, else in Grid's own (${LANGUAGES.join(' and ')}), else in English. The plan's own display.language when left out, else en.` }
}

/** The language a word asks for, refused by name when it is no language tag. `argument` names where it was given. */
export function askedLanguage(value: unknown, argument = '--lang'): Language | undefined {
  if (value === undefined) return undefined
  const language = readLanguage(value)
  if (language === null) throw new UsageError(`${argument} takes a language tag, such as ${LANGUAGES.join(', ')}, de or pt-BR: ${JSON.stringify(String(value).slice(0, 32))} is none.`)
  return language
}

/**
 * The language to write in, with its messages loaded: the one asked for, else the plan's, else
 * English. MSG-24: the plan's own words are handed to `say` too, in place of any plan's before.
 */
export async function languageFor(asked: Language | undefined, plan?: { readonly display?: { readonly language?: Language | undefined; readonly words?: unknown } | undefined }): Promise<Language> {
  const language = asked ?? plan?.display?.language ?? DEFAULT_LANGUAGE
  await loadLanguage(language)
  usePlanWords(plan?.display?.words)
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
