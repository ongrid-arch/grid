/**
 * MSG-24 (C32): the plan's own words for Grid's keys, one map per language, in `display.words`.
 *
 * Grid ships a file of its words for a few languages (`en.ts`, `es.ts`). For any other, the agent,
 * who speaks the person's language, writes Grid's words into the plan (`grid_words`), and `say`
 * uses them: the plan's word for the language first, then the language's file, then English.
 * A word must say what the English key says with the same values: it holds exactly the English
 * key's placeholders, keeps to the text rule, and is for a key Grid has. English is the source and
 * is never replaced.
 *
 * Pure but for the one store `say` reads (`setPlanWords`), which the command and every tool call
 * set from the plan they read, as `registerMessages` sets a language's file.
 */

import { textProblem } from '../types/planText'
import { en, type MessageKey } from './en'
import { DEFAULT_LANGUAGE, GROUND_FLOOR_NAME, isLanguage, readLanguage, type Language } from './languages'

/** The plan's words as the file holds them: each language's own map from key to wording. */
export type PlanWords = Readonly<Record<Language, Readonly<Record<string, string>>>>

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

/** The names of the placeholders a wording holds, in order, once each. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]!))]
}

/** Whether a key is one of Grid's. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key)
}

/** Why a word cannot be a key's wording: by its kind, with what the key needs. */
export type WordProblem =
  | { readonly kind: 'unknown-key' }
  | { readonly kind: 'not-text' }
  | { readonly kind: 'placeholders'; readonly needed: readonly string[]; readonly found: readonly string[] }
  | { readonly kind: 'text'; readonly problem: string }

/**
 * Why `text` cannot be the wording of `key`, or null when it can: a key Grid has, text, the text
 * rule, and exactly the English key's placeholders, in any order.
 */
export function wordProblem(key: string, text: unknown): WordProblem | null {
  if (!isMessageKey(key)) return { kind: 'unknown-key' }
  if (typeof text !== 'string') return { kind: 'not-text' }
  const problem = textProblem(text, 'word')
  if (problem !== null) return { kind: 'text', problem }
  const needed = placeholders(en[key])
  const found = placeholders(text)
  if (needed.length !== found.length || needed.some((name) => !found.includes(name))) return { kind: 'placeholders', needed, found }
  return null
}

/** A part of `display.words` the reader leaves out, at its place under `display.words`. */
export interface WordLeftOut {
  /** The language, then the key when it is one word; empty when the whole of `words` is left out. */
  readonly at: readonly string[]
  /** What was wrong: the words that are no map, a language that cannot hold words, or one word's problem. */
  readonly problem: { readonly kind: 'not-a-map' } | { readonly kind: 'language' } | WordProblem
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The sound words of a `display.words`, and each part left out. A language is a primary subtag
 * as `readLanguage` writes it (`de`, not `de-DE` or `DE`), and never English; a word is left out
 * on its own, the rest of its language kept. Undefined words when none is sound.
 */
export function readPlanWords(raw: unknown): { readonly words: PlanWords | undefined; readonly leftOut: readonly WordLeftOut[] } {
  if (raw === undefined) return { words: undefined, leftOut: [] }
  if (!isRecord(raw)) return { words: undefined, leftOut: [{ at: [], problem: { kind: 'not-a-map' } }] }
  const leftOut: WordLeftOut[] = []
  const words: Record<Language, Record<string, string>> = {}
  for (const [language, given] of Object.entries(raw)) {
    if (readLanguage(language) !== language || language === DEFAULT_LANGUAGE) {
      leftOut.push({ at: [language], problem: { kind: 'language' } })
      continue
    }
    if (!isRecord(given)) {
      leftOut.push({ at: [language], problem: { kind: 'not-a-map' } })
      continue
    }
    const kept: Record<string, string> = {}
    for (const [key, text] of Object.entries(given)) {
      const problem = wordProblem(key, text)
      if (problem === null) kept[key] = text as string
      else leftOut.push({ at: [language, key], problem })
    }
    if (Object.keys(kept).length > 0) words[language] = kept
  }
  return { words: Object.keys(words).length > 0 ? words : undefined, leftOut }
}

let planWords: PlanWords = {}

/**
 * Hands one plan's words to `say`, in place of any plan's before: the command and each tool call
 * that reads a plan does it once it knows the language (`languageFor`). Only sound words are kept.
 */
export function setPlanWords(words: unknown): void {
  planWords = readPlanWords(words).words ?? {}
}

/** The plan's word for a key in a language, when the plan gives one. */
export function planWord(language: Language, key: MessageKey): string | undefined {
  const own = planWords[language]
  return own !== undefined && Object.hasOwn(own, key) ? own[key] : undefined
}

let listening: Map<Language, Set<MessageKey>> | null = null

/** Records that a key was said in a language other than English, while an output is listened to. */
export function heard(language: Language, key: MessageKey): void {
  if (listening === null || language === DEFAULT_LANGUAGE) return
  const keys = listening.get(language) ?? new Set<MessageKey>()
  keys.add(key)
  listening.set(language, keys)
}

/** The keys said in each language other than English, as `listenForKeys` gives them. */
export type HeardKeys = ReadonlyMap<Language, ReadonlySet<MessageKey>>

/**
 * Runs `make` and gives the keys it said in each language other than English, so a tool lists
 * the words an output prints for this plan, and says when some of them were in English. The tool
 * server runs one call at a time, so the keys are the call's own.
 */
export async function listenForKeys<T>(make: () => T | Promise<T>): Promise<{ readonly result: T; readonly keys: HeardKeys }> {
  const before = listening
  const keys = new Map<Language, Set<MessageKey>>()
  listening = keys
  try {
    const result = await make()
    // CNT-47: handed out as read-only without TypeScript comparing a Set of every key with a
    // ReadonlySet of them, which grows past its limit as the keys grow.
    return { result, keys: keys as unknown as HeardKeys }
  } finally {
    listening = before
    if (before !== null) for (const [language, said] of keys) for (const key of said) heard(language, key)
  }
}

/**
 * MSG-24: the name of the floor a plan with no floor list stands on, in a language: the plan's
 * word for it (`floor.ground`), else the shipped language's (`GROUND_FLOOR_NAME`), else English.
 */
export function groundFloorName(language: Language): string {
  if (language === DEFAULT_LANGUAGE) return GROUND_FLOOR_NAME.en
  heard(language, 'floor.ground')
  return planWord(language, 'floor.ground') ?? (isLanguage(language) ? GROUND_FLOOR_NAME[language] : GROUND_FLOOR_NAME.en)
}
