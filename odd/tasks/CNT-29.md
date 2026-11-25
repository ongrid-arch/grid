# CNT-29: a low item in front of floor-to-ceiling glass does not block the window

## Outcome

A sofa, bench or low cabinet standing in front of glazing that runs to the floor is not called a
blocked window. `item/blocks-window` and `use/window-blocked` judge a window against the glass
left clear above the item, not against the sill: an item blocks a window only when it stands
higher than the sill and leaves less than `windowGlassKept` (1.0 m) of the window's height clear
above it. A kitchen run in front of a 1.2 m window with a 0.8 m sill still blocks it (0.3 m of
glass left); six sofas 0.8 m high in front of 2.4 m glass from the floor do not (1.6 m left).

## Design

- `packages/floorplan/src/geometry/use.ts`: `windowCover` keeps a fixture when it is higher than
  the sill and the window's top, less the fixture's height, is under `windowGlassKept`. Both
  readers (`itemUseIssues` and the CLI's `use/window-blocked`) go through it, so they agree.
- `tolerances.ts`: one new limit, `windowGlassKept` (Grid's own size, no document), with its row
  in `docs/tolerances.md` and its entry in the tolerances test.
- The sentence of `item/blocks-window` is unchanged: it already names height and sill.

## Done

- `useIndicators.test.ts`: a low item before full-height glass is not in `by`; a tall item before
  the same glass is; a kitchen run before a sill window still is.
- `tolerances.test.ts` and the docs table match. Package tests of `floorplan`, `cli` own words,
  typecheck, lint and scoreboard run.
