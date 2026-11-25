# VEW-21: Simplified Chinese names draw in every picture

## Outcome

A room named in Simplified Chinese (for example the characters 厅卫间储) draws as its glyphs,
not as boxes, in `grid_view`, `grid draw` PNGs and the plan on the client sheet. Japanese names
(with kana) keep their Japanese face.

## Design

- The cause: the `cjk` script list in `packages/cli/src/draw/scriptFonts.ts` starts with
  `Hiragino Sans`, a Japanese face with no simplified-only characters. A run in it draws a box for
  each character it lacks, and Skia gives a tspan no per-glyph fallback.
- `withScriptFonts` now chooses the font for a Han run from the text it sits in. A text with kana
  or Hangul keeps the Japanese list (`SCRIPT_FONTS.cjk`). Any other text with Han characters uses
  a new Chinese list, `SCRIPT_FONTS.han`, whose first entries are faces with simplified
  characters (`PingFang SC`, `Hiragino Sans GB`, `Songti SC`, `STHeiti`, `Microsoft YaHei`, Noto
  Sans CJK SC and the like), then the Japanese list as a last try. The deciding text is the whole
  text node, so a Japanese name's kanji and kana, split into runs, are drawn in one face.
- No font is bundled: the suitable faces on this machine are Apple's and cannot be shipped, and
  no Open Font License Chinese face is on disk; downloading is not allowed. The sheet's canvas
  already falls back per character, so `CJK_FONTS` in `sheet/fonts.ts` lists the Chinese faces
  before the Japanese ones.
- The SVG file a person keeps is unchanged.

## Done

- `scriptFonts.test.ts`: on a machine with both a Japanese and a Chinese face, a text of 厅卫间储
  gets the Chinese face and a text with kana gets the Japanese one; a PNG of 厅卫间储, and of each
  character alone, differs from the box picture.
- `fonts.test.ts`: the sheet draws 厅卫间储 as glyphs, and its fallback list has the Chinese
  faces ahead of the Japanese ones.
- typecheck, lint, the cli draw and sheet tests, scoreboard.
