# VEW-42: pictures, exports and the footprint open on the ground floor

## Outcome

A house with a basement no longer shows its basement first. When no floor is named, the plan
picture, the 3D still's floor, the sheet's drawing, an export of one floor, the preview and the
brief's footprint line all take the ground floor (the floor at level 0), else the lowest floor
above ground, else the lowest. A plan that is all basement still opens on its lowest floor. A
floor that is named, basement included, is shown as asked.

## Design

- `packages/floorplan/src/geometry/floors.ts`: `resolveFloor` falls back to `defaultFloor`
  instead of the lowest floor. `defaultFloor` and `viewFloor` already existed and were used by
  nothing; every reader of the default goes through `resolveFloor`, so one change reaches the
  pictures (`planSvg`, `comparison`, `drawPlan`, `views`, `partBoxes`), the exports
  (`planExport`, `command/export.ts` naming), the sheet, the preview tools and the trace.
- `packages/cli/src/brief/lines.ts`: the footprint line measures the ground floor (the default
  floor, if it has solid walls) instead of the lowest floor with walls.
- Help text and comments that say "the lowest floor when left out" say "the ground floor".

## Done

- `floors.test.ts`: `resolveFloor` with no request gives the ground floor of a plan with a
  basement; a named basement is kept; an all-basement plan gives its lowest.
- A picture, an export and a footprint line of a house with a basement start on the ground floor.
- `changes/VEW-42.md` written; typecheck, lint, the floorplan, viewer and cli test folders, the
  own-words and tolerance tests and the scoreboard pass.
