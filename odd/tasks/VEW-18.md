# VEW-18: Arabic and Hebrew names draw as letters on plans and sheets

## Outcome

- A room named in Arabic or Hebrew draws as its letters, shaped and joined and read right to
  left, in a PNG of a plan and in the sheet's PDF, on any machine, not as a row of boxes.
- It does not depend on the machine having an Arabic or Hebrew font: Grid ships one.
- The SVG file a person keeps is unchanged (a browser has its own fonts).

## Design

- Ship two fonts in `packages/cli/fonts/`, next to the sheet's: Noto Sans Arabic and Noto Sans
  Hebrew, both SIL Open Font License 1.1, taken unchanged from fonts already on this machine
  (nothing downloaded). Their licence texts go beside them, and `NOTICE` names them with their
  copyright lines. The build and the pack already copy the whole `fonts/` folder.
- `draw/scriptFonts.ts` learns two scripts, `arabic` and `hebrew`: a character test for each,
  and a font list that starts with Grid's own bundled family, then the system's. A run in one of
  these scripts is wrapped in a `<tspan>` of the first family the canvas has, as CJK already is.
- `sheet/fonts.ts` registers the two bundled files under Grid's own family names, together with
  the sheet fonts (`registerSheetFonts`) and for a plan picture (`registerScriptFonts`, called
  by `drawPlan` and the multi-plan view before they ask which fonts are installed). The sheet's
  canvas font list gets the two families, so its text falls back to them per character.
- Arabic punctuation and digits stay with Latin text unless they sit in an Arabic run; marks
  (harakat) belong to the letter before them (already so by `\p{M}`).

## Done

- `scriptFonts` tests: Arabic and Hebrew are runs of their own script; fonts list picks the
  bundled family first.
- `fonts` tests: the bundled files are registered, the sheet font list names them.
- A PNG test: an Arabic and a Hebrew room name draw differently from the box (two private-use
  characters) and from each other, with the bundled font, on any machine.
- Typecheck, lint, the cli and rules-contract tests touched, scoreboard unchanged.
