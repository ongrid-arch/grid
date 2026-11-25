/**
 * VEW-7: system fonts for the scripts the picture's font (`PICTURE_FONT`) and the sheet's
 * bundled fonts lack, and the change that makes a PNG draw them.
 *
 * Skia's SVG text takes the first font of an element's `font-family` that the machine has and
 * draws every character in it, with no fallback for a character that font lacks: a Japanese
 * name in Helvetica is a row of boxes. So before a picture is rasterised, each run of text in
 * one of these scripts is wrapped in a `<tspan>` whose `font-family` is a system font that has
 * it. A tspan carries no position, so every label stays where the picture put it. Only the
 * PNG gets this: the SVG file a person keeps is the picture as it is.
 */
import type { SvgChild, SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { el } from '@ongrid/viewer/src/picture/svgNode'
import { visualOrder } from './visualOrder'

export type Script = 'cjk' | 'hangul' | 'thai' | 'devanagari' | 'arabic' | 'hebrew' | 'emoji'

/** VEW-18: the family names Grid registers its bundled Arabic and Hebrew fonts under. */
export const ARABIC_FONT = 'Grid Script Arabic'
export const HEBREW_FONT = 'Grid Script Hebrew'

/** For each script, the fonts that have it, by the names macOS, Windows and Linux give them. */
export const SCRIPT_FONTS: Readonly<Record<Script, readonly string[]>> = {
  cjk: ['Hiragino Sans', 'Hiragino Sans GB', 'Microsoft YaHei', 'Yu Gothic', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'WenQuanYi Micro Hei'],
  hangul: ['Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR'],
  thai: ['Sukhumvit Set', 'Thonburi', 'Leelawadee UI', 'Noto Sans Thai'],
  devanagari: ['Kohinoor Devanagari', 'Nirmala UI', 'Noto Sans Devanagari'],
  // Grid's own bundled fonts first (VEW-18): they shape and join the letters on any machine.
  arabic: [ARABIC_FONT, 'Geeza Pro', 'Segoe UI', 'Noto Sans Arabic'],
  hebrew: [HEBREW_FONT, 'Arial Hebrew', 'Segoe UI', 'Noto Sans Hebrew'],
  emoji: ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji']
}

/** A font with every script above but emoji, for a machine that has none of their own fonts. */
export const LAST_RESORT_FONT = 'Arial Unicode MS'

const SCRIPTS: readonly (readonly [Script, RegExp])[] = [
  ['cjk', /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}　-〿゠-ヿ㈀-㏿＀-￯]/u],
  ['hangul', /\p{sc=Hangul}/u],
  ['thai', /[฀-๿]/u],
  ['devanagari', /[ऀ-ॿ꣠-ꣿ]/u],
  // Arabic and its supplements and presentation forms; Hebrew with its points and ligatures.
  ['arabic', /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u],
  ['hebrew', /[\u0590-\u05ff\ufb1d-\ufb4f]/u],
  // An emoji by default, or a pictograph a text font lacks or that asks to be drawn as one.
  ['emoji', /\p{Emoji_Presentation}|\p{Extended_Pictographic}(?=️)|[\u{1f000}-\u{1faff}]/u]
]

/** Marks, variation selectors and the joiner belong to the character before them. */
const CONTINUES = /[\p{M}‍]/u

export interface ScriptRun {
  /** The script whose font the run needs, or `null` for one the picture's own font has. */
  readonly script: Script | null
  readonly text: string
}

function scriptOf(char: string, next: string | undefined): Script | null {
  const pair = next === undefined ? char : char + next
  for (const [script, pattern] of SCRIPTS) {
    const match = pattern.exec(pair)
    if (match?.index === 0) return script
  }
  return null
}

/** A text cut where its script changes, by whole characters. */
export function scriptRuns(text: string): ScriptRun[] {
  const chars = [...text]
  const runs: { script: Script | null; text: string }[] = []
  chars.forEach((char, index) => {
    const last = runs[runs.length - 1]
    const script = last !== undefined && CONTINUES.test(char) ? last.script : scriptOf(char, chars[index + 1])
    if (last?.script === script) last.text += char
    else runs.push({ script, text: char })
  })
  return runs
}

/**
 * The nodes with each run of text in one of these scripts put in a `<tspan>` of the first font
 * for it that `installed` says the machine has. A run no installed font has is left as it is.
 */
export function withScriptFonts(nodes: readonly SvgNode[], installed: (family: string) => boolean): SvgNode[] {
  const chosen = new Map<Script, string | null>()
  const fontFor = (script: Script): string | null => {
    if (!chosen.has(script)) {
      const own = SCRIPT_FONTS[script].find(installed)
      chosen.set(script, own ?? (script !== 'emoji' && installed(LAST_RESORT_FONT) ? LAST_RESORT_FONT : null))
    }
    return chosen.get(script)!
  }
  const walk = (children: readonly SvgChild[], inText: boolean): SvgChild[] =>
    children.flatMap((child): SvgChild[] => {
      if (typeof child !== 'string') return [rewrite(child, inText)]
      if (!inText) return [child]
      const pieces: SvgChild[] = []
      for (const { script, text } of scriptRuns(visualOrder(child))) {
        const family = script === null ? null : fontFor(script)
        const last = pieces[pieces.length - 1]
        if (family !== null) pieces.push(el('tspan', { 'font-family': family }, [text]))
        else if (typeof last === 'string') pieces[pieces.length - 1] = last + text
        else pieces.push(text)
      }
      return pieces
    })
  const rewrite = (node: SvgNode, inText: boolean): SvgNode => {
    const text = inText || node.tag === 'text'
    return { ...node, children: walk(node.children, text) }
  }
  return nodes.map((node) => rewrite(node, false))
}
