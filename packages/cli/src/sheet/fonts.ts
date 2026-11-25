/**
 * VEW-7: the sheet's two fonts, Source Serif 4 and Source Sans 3 (SIL Open Font License 1.1,
 * `fonts/OFL-SourceSerif4.txt` and `fonts/OFL-SourceSans3.txt`), shipped with Grid so a sheet
 * looks the same on every machine.
 *
 * The canvas reads the files itself, so nothing here imports `fs`. The folder is found from
 * where this code runs, and is only ever the install's own: `./fonts/` beside the built
 * `grid.mjs`, or `../fonts/` from its `chunks/` folder. Run from the sources (the tests), it is
 * the package's `fonts/`, two folders up from this file.
 */
import { fileURLToPath } from 'url'
import { ARABIC_FONT, HEBREW_FONT, LAST_RESORT_FONT, SCRIPT_FONTS } from '../draw/scriptFonts'

export const SERIF = 'Grid Sheet Serif'
export const SANS = 'Grid Sheet Sans'

/**
 * System fonts for the scripts the bundled fonts lack (Chinese, Japanese, Korean, Thai,
 * Devanagari, emoji): the pictures' own lists (`SCRIPT_FONTS`). The canvas takes each
 * character from the first font in a list that has it; without a list it falls back only to
 * the system's default font, which has none of these, and draws a box.
 */
export const CJK_FONTS = [...SCRIPT_FONTS.han, ...SCRIPT_FONTS.cjk, ...SCRIPT_FONTS.hangul] as const
const FALLBACK_FONTS = [
  ...SCRIPT_FONTS.arabic,
  ...SCRIPT_FONTS.hebrew,
  ...CJK_FONTS,
  ...SCRIPT_FONTS.thai,
  ...SCRIPT_FONTS.devanagari,
  LAST_RESORT_FONT,
  ...SCRIPT_FONTS.emoji,
]

/** A canvas font: one of the sheet's families, then the system's fonts, then its default. */
export function sheetFont(family: string, size: number, weight: 400 | 600 = 400): string {
  return `${weight} ${size}px "${family}", ${FALLBACK_FONTS.map((name) => `"${name}"`).join(', ')}, sans-serif`
}

export class FontsMissing extends Error {
  override readonly name = 'FontsMissing'
}

const FILES = [
  ['SourceSerif4-Regular.otf', SERIF],
  ['SourceSerif4-Semibold.otf', SERIF],
  ['SourceSans3-Regular.otf', SANS],
  ['SourceSans3-Semibold.otf', SANS],
] as const

/** The one folder the fonts are read from. */
export function fontsFolder(moduleUrl: string = import.meta.url): string {
  const relative = moduleUrl.endsWith('.ts') ? '../../fonts/' : /\/chunks\/[^/]*$/.test(moduleUrl) ? '../fonts/' : './fonts/'
  return fileURLToPath(new URL(relative, moduleUrl))
}

let registered = false

/** Registers the four fonts once. Throws FontsMissing when the install's folder lacks them. */
export function registerSheetFonts(canvas: typeof import('@napi-rs/canvas')): void {
  if (registered) return
  const folder = fontsFolder()
  const keys = FILES.map(([file, family]) => canvas.GlobalFonts.registerFromPath(`${folder}${file}`, family))
  if (keys.some((key) => key === null)) throw new FontsMissing('The sheet fonts are missing from this install of Grid: reinstall it.')
  registered = true
  registerScriptFonts(canvas)
}

/** VEW-18: Noto Sans Arabic and Noto Sans Hebrew (SIL Open Font License 1.1), for names in those scripts. */
const SCRIPT_FILES = [
  ['NotoSansArabic.woff2', ARABIC_FONT],
  ['NotoSansHebrew-Regular.woff2', HEBREW_FONT],
] as const

let scriptRegistered = false

/**
 * Registers the Arabic and Hebrew fonts once, for a picture or the sheet. Unlike the sheet's own
 * fonts, an install without them still draws: those names fall back to a system font, if any.
 */
export function registerScriptFonts(canvas: typeof import('@napi-rs/canvas')): void {
  if (scriptRegistered) return
  const folder = fontsFolder()
  for (const [file, family] of SCRIPT_FILES) canvas.GlobalFonts.registerFromPath(`${folder}${file}`, family)
  scriptRegistered = true
}
