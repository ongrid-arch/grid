/**
 * MSG-34: how an answer says its words: in one language, with one decimal mark, so no answer
 * writes some figures with a comma and others with a point. A sentence made elsewhere in English
 * (a rule, a note) is said in the language when it is a key's whole wording, else as it is with
 * the answer's decimal mark in its figures.
 *
 * Pure: keys and values in, text out.
 */
import type { DecimalMark } from '../types/units'
import { en, type MessageKey } from './en'
import { DEFAULT_LANGUAGE, type Language } from './languages'
import { say, sayValue, type Value, type Values } from './say'

/**
 * How a tool says its words: in one language, with one decimal mark (the display's), so no
 * answer writes some figures with a comma and others with a point.
 */
export interface Speaker {
  readonly language: Language
  readonly decimal: DecimalMark
  /** A key's wording, its placeholders filled. */
  say(key: MessageKey, values?: Values): string
  /** A value: a sentence by key, a figure, a list. */
  value(value: Value): string
  /**
   * A sentence made elsewhere in English: said in the language when it is a key's whole wording
   * (a rule, a note with no figure), else as it is, its figures given the answer's decimal mark.
   */
  text(english: string): string
  /** A figure as Grid rounds it ("0.80"), with the answer's decimal mark. */
  figure(text: string): string
}

let byWording: Map<string, MessageKey> | null = null

/** The key whose English wording is exactly this text, when one has no placeholder. */
export function keyOfWording(text: string): MessageKey | undefined {
  if (byWording === null) {
    byWording = new Map()
    for (const [key, wording] of Object.entries(en) as [MessageKey, string][]) {
      if (!wording.includes('{') && wording.length > 0 && !byWording.has(wording)) byWording.set(wording, key)
    }
  }
  return byWording.get(text)
}

/** The decimal mark put into a text's figures, never into a quoted name. */
export function marked(text: string, decimal: DecimalMark): string {
  if (decimal === 'point') return text
  return text.split(/("[^"\n]*")/).map((part, i) => (i % 2 === 1 ? part : part.replace(/(\d)\.(\d)/g, '$1,$2'))).join('')
}

export function speakerFor(language: Language, decimal: DecimalMark): Speaker {
  const options = { decimal }
  return {
    language,
    decimal,
    say: (key, values) => say(language, key, values ?? {}, options),
    value: (value) => sayValue(language, value, options),
    text: (english) => {
      const key = language === DEFAULT_LANGUAGE ? undefined : keyOfWording(english)
      return key === undefined ? marked(english, decimal) : say(language, key, {}, options)
    },
    figure: (text) => marked(text, decimal),
  }
}

/** English with a point: what every answer said before it had a language. */
export const ENGLISH_SPEAKER: Speaker = speakerFor(DEFAULT_LANGUAGE, 'point')
