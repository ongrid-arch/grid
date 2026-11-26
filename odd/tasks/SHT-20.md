# SHT-20: every floor at one stated scale, and a long floor over pages

## Outcome

An agent that asks `grid_sheet` (or `grid sheet --layout drawing`) for a drawing at 1:100 on A3
gets every floor of the building, one page each, all at 1:100 on A3, each with its scale bar and
north arrow, in one PDF. A floor named with `floor` is drawn alone, as before. When a floor is too
large for the paper at the scale, the refusal names the floor and offers a paper that fits, a
scale that fits the paper, and splitting it over a number of pages. With `split` (`--split`), a
long building is cut into parts at the same scale, one part to a page, each saying which part it
is, with a dashed line where the next part continues. No agent has to write its own PDF to get a
building at a stated scale.

## Design

- `packages/cli/src/sheet/drawingSheet.ts`: `drawingSheets` lays out the whole set. It works out
  each floor's frame, then the one scale and paper every floor fits (the largest of 1:100, 1:200
  and 1:500 and the smallest paper, as for one floor), so every page is at the same scale. Each
  page is laid out by the same code as SHT-6's one floor (`drawingSheet` is now one page of it).
  A floor that fits nothing is refused with SHT-6's words, its name before them on a plan of
  several floors, and the number of pages it would split over. With `split`, a floor too large
  is cut into equal parts in a grid along its sides, the fewest that fit the paper's drawing area
  at that orientation; each part's picture is the floor's picture framed to the part (the nested
  SVG clips it), with a dashed match line on each cut side.
- Choosing with `split`: the scale asked, else the largest tried that every floor fits whole,
  else 1:100; the paper asked, else the smallest every floor fits whole at that scale, else A0,
  the fewest pages.
- `drawingFiles.ts`: the PDF has one page per sheet; the SVG and the PNG are one file per page.
- `sheetFile.ts`: the files' names. One page keeps SHT-6's names. Several pages: one PDF, and
  `-page-<n>` SVG and PNG files beside it. A drawing of every floor of a plan of several floors
  has no `-floor-<n>` in its name. `--split` is the command's new option, `split` the tool's.
- `grid_sheet` answers with every page in `pages` (`floor`, and `part` and `parts` when split),
  `svgs` and `pngs`, and every page's PNG to look at. `svg` and `png` stay the first page's.
- Words: the part's line is a new message key in `en.ts` and `es.ts`; the refusal stays in
  SHT-6's English, as it is today.
- Decision: the default for a plan of several floors changes from the lowest floor to every
  floor, because a drawing of a building at a scale is all of it; `floor` keeps one floor.

## Done

- `packages/cli/src/sheet/__tests__/drawingSets.test.ts`: a two-floor plan gives two pages at
  the same scale and paper, each with a scale bar and a north arrow, measured on the PDF; a floor
  too large is refused naming it and offering split; with split, a 60 m wall at 1:100 on A4 is
  three pages, each part's drawing within its page, the wall's ink across all parts 60 m long.
- `packages/cli/src/mcp/__tests__/sheetTool.test.ts` and `command/__tests__/sheet.e2e.test.ts`:
  the tool's and the command's answers and file names for a set and a split.
- Type check of `packages/cli`, lint, `packages/cli` sheet, mcp and command tests,
  `ownWords.test.ts`, `tolerances.test.ts`.
