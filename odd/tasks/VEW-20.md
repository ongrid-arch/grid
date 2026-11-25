# VEW-20: levels written one way, in the plan's units, in plan, section and elevation

## Outcome
- A level reads the same in a section, an elevation and on the plan: a sign, then the figure,
  then (in a section or elevation) the name: `+94.900 Level 29`, `±0.000 Ground floor`.
- The figure is in the plan's display units (or the call's `units`): metres with three decimals,
  centimetres with one, millimetres whole, feet and inches as `31'-9"`, with the display's decimal mark.
- `grid_view` kind=section and kind=facade follow `units` and `decimal` instead of ignoring them;
  a plan that states feet or millimetres in its display is drawn in them. Room heights in a
  section follow the same units.

## Design
- `levelText(level, display?)` in `packages/floorplan/src/geometry/section.ts` is the one writer
  (`showLength` from `types/units.ts` does the figure). Without a display it writes metres as before.
- `facade.ts` in the viewer drops its own two-decimal writer and uses `levelText`, with the label
  in the section's order (level, then name).
- Both pictures take a `display` option, else the plan's own display, with the decimal mark of the
  drawing's language (as before). The plan's level marks are unchanged (metres, the same writer).
- `grid_view` passes the call's display to both; the answers' text writes levels in it.
- Decision: the data in the answer stays in metres; only the words are in the display.

## Done
- Tests: levelText per unit; section and facade pictures in mm and ft-in plans; the two label orders
  match; grid_view kind=section/facade with units. `npm run typecheck`, `lint`, floorplan, viewer,
  cli tests, scoreboard.
