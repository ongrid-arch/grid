# WRT-21: a door keeps its sill when its width or swing changes

## Outcome
Changing a door's width, swing, place or height leaves its threshold as it was. Only turning a
window or doorless opening into a door sets the sill to floor level, and an explicit `sill` always wins.

## Design
`changeOpening` in `packages/cli/src/edit/edits.ts` set the sill to 0 for every door that was
not given a sill. It now does so only when the request changes the type to `door` from another
type. Same path for the CLI (`grid edit`) and the tool server (`grid_change_opening`).

## Done
`packages/cli/src/mcp/__tests__/openingSill.test.ts`: widening and turning a door with a 0.02 m
sill keeps it (fails before), and a window made a door still gets sill 0.
