# VEW-37: grid_compare's picture draws every floor of each option

## Outcome

- `grid_compare` with `picture: true` and no `floor` draws all of each option's floors, stacked in
  the option's column (the highest at the top), every floor at the same scale as every other
  floor of every option, each with its floor's name over it. A two-storey house beside a one-storey
  villa shows both of the house's floors, so its bedrooms are seen.
- With `floor` given, the picture is as before: that floor of each plan, one per column.
- An option's title stays clear of the sheet's label: the sheet is as tall as its tallest column
  including each drawing's own band of title and key, and the label goes in its own band below.

## Design

- `packages/cli/src/draw/views.ts`, `sheetView`: a plan entry gains no new field; with no `floor`
  the entry is drawn as one picture per floor of the plan (`planFloors`, from the top down), with
  `floor` as one. A column's width is its widest floor; the scale is columns' width in metres
  summed against the sheet's width, as before. A plan with a single floor draws as it did, with
  no floor name.
- Floor names are written as text in the picture's own font, in a small band above each floor
  when the column has more than one.
- The column's height is the sum of its floors' full heights (`fullHeight`, which counts the key
  band under the drawing) and the name bands; the sheet is the tallest column plus the title band.
- Decision: the floors are stacked top to bottom with the highest first, as a building stands.
- `readTools.ts` needs no change: it already passes no floor when none is given.

## Done

- A test draws a two-floor plan and a one-floor plan: the sheet is taller than for the one-floor
  plans alone, and its scale (pixels per metre) is the same as that of the plans drawn on one
  floor each.
- A test that the sheet keeps its title band clear of the picture: the title text lies above the
  first drawing.
- `npx vitest run packages/cli packages/viewer`, `ownWords`, `tolerances`, typecheck, lint, scoreboard.
