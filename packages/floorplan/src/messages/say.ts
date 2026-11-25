/**
 * MSG-11: one way to write Grid's own words in a language. A sentence is a key of the message
 * files (`en.ts`, `es.ts`) and its values; `say` fills the key's placeholders, `{width}`, with
 * them, in the language asked for and with its decimal mark.
 *
 * A value is data, never words of Grid's own: a name or an id as the plan writes it (quoted by
 * the caller), a number, a figure as Grid rounds it (`num`), or another sentence by its key
 * (`said`), so a sentence made of parts is in one language throughout. Lists are joined with
 * the language's own words (`joined`). Pure: keys and values in, text out.
 */

import { quoted } from '../types/planText'
import type { DecimalMark } from '../types/units'
import { en, type MessageKey } from './en'
import { DEFAULT_LANGUAGE, languageDecimal, type Language } from './languages'
import { heard, planWord } from './words'

export type { MessageKey } from './en'
export { placeholders } from './words'

/** A figure as Grid rounds it, written with a decimal point ("0.80"); the language's mark is put in when it is said. */
export interface Num {
  readonly num: string
}

/** A name or an id as the plan writes it: said in double quotes (`quoted`), never translated. */
export interface Name {
  readonly name: string
}

/** A sentence by its key, with its own values. */
export interface Said {
  readonly key: MessageKey
  readonly values?: Values
}

/** Values joined by the language's words: `with` between them, `last` before the last one. */
export interface Joined {
  readonly join: readonly Value[]
  readonly with: MessageKey
  readonly last?: MessageKey
}

export type Value = string | number | Num | Name | Said | Joined
export type Values = Readonly<Record<string, Value>>

export type Messages = Readonly<Record<MessageKey, string>>

/** A figure as Grid rounds it ("0.80", from `metresText` or `figureText`). */
export const num = (text: string): Num => ({ num: text })

/** A name or an id from the plan, as the plan writes it. */
export const name = (text: string): Name => ({ name: text })

/** A sentence by its key. */
export const said = (key: MessageKey, values?: Values): Said => (values === undefined ? { key } : { key, values })

/** Values joined by the words of `with`, and of `last` before the last one. */
export const joined = (values: readonly Value[], withKey: MessageKey, last?: MessageKey): Joined =>
  last === undefined ? { join: values, with: withKey } : { join: values, with: withKey, last }

export function isSaid(value: unknown): value is Said {
  return typeof value === 'object' && value !== null && typeof (value as { key?: unknown }).key === 'string'
}

const tables: Record<Language, Messages> = { en }

/** Gives `say` a language's messages: the command loads them when the person asks for the language. */
export function registerMessages(language: Language, messages: Messages): void {
  tables[language] = messages
}

/** Whether a language's messages are loaded: English always is. */
export function hasMessages(language: Language): boolean {
  return Object.hasOwn(tables, language)
}

/**
 * MSG-24: a key's wording in a language: the plan's own word for it (`display.words`, C32), else
 * the language's file, else English.
 */
function wording(language: Language, key: MessageKey): string {
  heard(language, key)
  const own = planWord(language, key)
  if (own !== undefined) return own
  const table = Object.hasOwn(tables, language) ? tables[language]! : en
  return table[key] ?? en[key] ?? key
}

/**
 * MSG-24: whether a language has its own wording for a key, from the plan's words or its file.
 * English has every key.
 */
export function hasWording(language: Language, key: MessageKey): boolean {
  if (language === DEFAULT_LANGUAGE) return true
  return planWord(language, key) !== undefined || (Object.hasOwn(tables, language) && tables[language]![key] !== undefined)
}

/**
 * Loads a language's messages, once. English is always there; Spanish is its own file, read only
 * when it is asked for, so the command starts without it.
 */
export async function loadLanguage(language: Language): Promise<void> {
  if (hasMessages(language)) return
  if (language === 'es') registerMessages('es', (await import('./es')).es)
}

export interface SayOptions {
  /** The decimal mark; the language's own when not given. */
  readonly decimal?: DecimalMark | undefined
}

/** The decimal mark a language writes, unless the display chooses one: a point for a language Grid ships no file for. */
export function decimalFor(language: Language, stated?: DecimalMark): DecimalMark {
  return stated ?? languageDecimal(language)
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

function marked(text: string, decimal: DecimalMark): string {
  return decimal === 'comma' ? text.replace(/(\d)\.(\d)/g, '$1,$2') : text
}

/** One value as text in the language. */
export function sayValue(language: Language, value: Value, options: SayOptions = {}): string {
  const decimal = decimalFor(language, options.decimal)
  if (typeof value === 'string') return value
  if (typeof value === 'number') return marked(String(value), decimal)
  if ('num' in value) return marked(value.num, decimal)
  if ('name' in value) return quoted(value.name)
  if ('join' in value) {
    const parts = value.join.map((v) => sayValue(language, v, options))
    if (parts.length < 2) return parts.join('')
    const between = say(language, value.with, undefined, options)
    if (value.last === undefined) return parts.join(between)
    return `${parts.slice(0, -1).join(between)}${say(language, value.last, undefined, options)}${parts[parts.length - 1]}`
  }
  return say(language, value.key, value.values, options)
}

/**
 * A key's wording in a language, with its placeholders filled: the plan's own word, else the
 * language's file, else English (MSG-24); a placeholder with no value is left as it is, so a test sees it.
 */
export function say(language: Language, key: MessageKey, values: Values = {}, options: SayOptions = {}): string {
  const text = wording(language, key)
  if (!text.includes('{')) return text
  return text.replace(PLACEHOLDER, (whole, name: string) => (Object.hasOwn(values, name) ? sayValue(language, values[name]!, options) : whole))
}

/** A sentence in English: the wording every message Grid keeps in English (`Issue.message`) is made with. */
export function english(value: Said): string {
  return sayValue('en', value)
}

/**
 * The values as data, for a record: numbers as numbers (a figure as Grid rounded it), and names,
 * ids and places as given. A part that is a sentence of Grid's own is left out: it is words, in
 * a language, and the line's own text says it.
 */
export function valuesData(values: Values): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number') out[name] = value
    else if ('num' in value) out[name] = Number(value.num)
    else if ('name' in value) out[name] = value.name
  }
  return out
}

/** A run of a sentence; `name` marks a name from the plan, as the notes set it apart. */
export interface SaidPart {
  readonly text: string
  readonly name?: true
}

/**
 * A sentence as runs, each name from the plan (`Name`) a run of its own and unquoted, the rest
 * as `say` writes it: the notes a person reads set the names apart (MSG-9).
 */
export function sayParts(language: Language, key: MessageKey, values: Values = {}, options: SayOptions = {}): SaidPart[] {
  const text = wording(language, key)
  const parts: SaidPart[] = []
  let at = 0
  const words = (run: string): void => {
    if (run.length === 0) return
    const last = parts[parts.length - 1]
    if (last !== undefined && last.name === undefined) parts[parts.length - 1] = { text: last.text + run }
    else parts.push({ text: run })
  }
  for (const m of text.matchAll(PLACEHOLDER)) {
    words(text.slice(at, m.index))
    at = m.index + m[0].length
    const value = Object.hasOwn(values, m[1]!) ? values[m[1]!]! : undefined
    if (value === undefined) words(m[0])
    else if (typeof value === 'object' && 'name' in value) parts.push({ text: value.name, name: true })
    else if (typeof value === 'object' && 'join' in value && value.join.some((v) => typeof v === 'object' && 'name' in v)) {
      value.join.forEach((v, i) => {
        if (i > 0) words(say(language, i === value.join.length - 1 && value.last !== undefined ? value.last : value.with, undefined, options))
        if (typeof v === 'object' && 'name' in v) parts.push({ text: v.name, name: true })
        else words(sayValue(language, v, options))
      })
    } else words(sayValue(language, value, options))
  }
  words(text.slice(at))
  return parts
}

/**
 * A record with its sentence by key and values (`said`), set so it is not enumerable: the record
 * reads, compares and prints as it did before it had one. Read it as `record.said`.
 */
export function withSentence<T extends object>(record: T, sentence: Said): T & { readonly said: Said } {
  return Object.defineProperty(record, 'said', { value: sentence, enumerable: false }) as T & { readonly said: Said }
}
