# SHT-19: the sheet's text layer holds the characters a person wrote

## Outcome

Search, copy and screen readers get the same Chinese, Japanese and Korean characters from a
sheet PDF as the ones written in the plan. A character that shares its outline with a Kangxi
radical or a compatibility ideograph (小, 方, 面) is no longer handed out as that radical
(⼩, ⽅, ⾯): the PDF's text layer holds its true code point.

## Design

- The cause: the PDF writer keeps one code point per glyph in each font's `ToUnicode` map, and
  where a face draws a radical and its ideograph with the same glyph it picks the radical.
  The drawing is right and only the text behind it is wrong.
- `packages/cli/src/sheet/pdfText.ts`: `trueCodePoints(pdf)` reads the file's classic cross
  reference table, finds each stream that is a `ToUnicode` map, and rewrites every entry whose text
  is in the Kangxi radicals, the CJK radicals supplement or the compatibility ideographs to its
  compatibility form (`NFKC`), which is the unified ideograph. Entries elsewhere are never touched.
  A `bfrange` that starts in those blocks is written out as single entries. Streams are inflated
  and deflated again, the object offsets, `startxref` and the table are written again, and a file
  that is not shaped as the writer's own is returned as it came.
- `packages/cli/src/sheet/pdf.ts`: `sheetPdf` passes the closed document through it.
- Decision: a radical typed on purpose is copied out as its ideograph too. A sheet is read by
  search, and a person who types a radical is rare against one who types a character the writer
  mis-mapped.
- No new convention and no new message code.

## Done

- `packages/cli/src/sheet/__tests__/pdfText.test.ts`: a sheet whose rooms are named 小房间, 方厅
  and 面积 reads back from its `ToUnicode` maps with those characters and none from the radical
  blocks (skipped when the machine has no Chinese system font); the rewrite on a hand-made map
  keeps entries outside the blocks, expands a range, and leaves a file it does not understand as it
  was; the PDF still opens (page count and objects unchanged).
- `ownWords.test.ts` and `tolerances.test.ts` pass.
