/**
 * The person's language on a `display` line (WRT-87): `display mm language es`, or `display
 * language es` with no length, which is the plan's `display.language` (MSG-24, C32).
 *
 * The rooms text compiler (`compile.ts`) holds lengths, not languages, so the words are taken out
 * of the text before it is compiled, and the line keeps its place (a line of nothing but `display
 * language <tag>` is left blank), so every line number a refusal gives is the line written.
 * `grid write` sets the language it found in the plan's `display`, and the read-back writes it.
 *
 * Pure: text in, text out.
 */
import { readLanguage } from '../messages/languages'

/** The text without the language words of its display lines, and the language the last one names. */
export interface LanguageWords {
  readonly text: string
  readonly language: string | null
}

const LANGUAGE_WORDS = /\s+language\s+(\S+)/

/** The language words of each `display` line taken out of `text`, and the language they name. */
export function languageOfText(text: string): LanguageWords {
  let language: string | null = null
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const hash = line.indexOf('#')
    const said = hash < 0 ? line : line.slice(0, hash)
    const comment = hash < 0 ? '' : line.slice(hash)
    if (!/^\s*display\b/.test(said)) continue
    const found = LANGUAGE_WORDS.exec(said)
    const tag = found === null ? null : readLanguage(found[1])
    // A tag that is no language is left on the line, so the compiler refuses the line with its usage.
    if (tag === null || !/^[a-z]{2,3}$/.test(tag)) continue
    language = tag
    const rest = said.replace(LANGUAGE_WORDS, '')
    lines[i] = /^\s*display\s*$/.test(rest) ? comment : `${rest}${comment}`
  }
  return { text: language === null ? text : lines.join('\n'), language }
}

/** The words of a display line that name the language, as the read-back writes them. */
export const languageWords = (language: string): string => `language ${language}`
