/**
 * MSG-11: the language a drawing's own words are written in, and its decimal mark. Every word
 * Grid writes on a drawing is a key of the message files (`drawing.*`), said here; room names,
 * ids and the author's own words (notes, sketch categories, the title) are drawn as written.
 *
 * The language comes with the drawing's display (`Display.language`), else English; the mark is
 * the display's, which is the language's own unless the display states one (`statedDisplay`).
 *
 * Pure: keys and values in, text out.
 */
import { DEFAULT_LANGUAGE, languageDecimal, say, sayValue, labelOfUse, type Language, type MessageKey, type Said, type Values } from '@ongrid/floorplan/messages'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import type { DecimalMark, Display } from '@ongrid/floorplan/types/units'

export interface DrawingWords {
  readonly language: Language
  readonly decimal: DecimalMark
}

export const ENGLISH_WORDS: DrawingWords = { language: DEFAULT_LANGUAGE, decimal: 'point' }

/** The words of a drawing in this display: its language, English when it names none, and its mark. */
export function wordsOf(display: Display | undefined): DrawingWords {
  if (display === undefined) return ENGLISH_WORDS
  const language = display.language ?? DEFAULT_LANGUAGE
  return { language, decimal: display.decimal ?? languageDecimal(language) }
}

/** A key's wording on the drawing. */
export function drawingText(words: DrawingWords, key: MessageKey, values?: Values): string {
  return say(words.language, key, values, { decimal: words.decimal })
}

/**
 * A sentence Grid made elsewhere (a door's warning), in the drawing's language: its key and
 * values when it carries them, else its English as it came. English is always the text given.
 */
export function saidText(words: DrawingWords, message: string, said: Said | undefined): string {
  if (words.language === DEFAULT_LANGUAGE || said === undefined) return message
  return sayValue(words.language, said, { decimal: words.decimal })
}

/** A room use's word in the drawing's language: the use's own label (`labelOfUse`). */
export function roomUseWord(words: DrawingWords, use: RoomUse): string {
  return labelOfUse(words.language, use)
}
