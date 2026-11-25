# ARE-24: plot coverage leaves open outdoor rooms out, and gives both figures

## Outcome

- The plot coverage of `grid_measure what=site`, `grid describe` and the brief's `plot_coverage`
  wish is the enclosed building (and roofed outdoor space such as a porch) over the plot. Open
  outdoor rooms (a terrace, a pool deck, a garden, a balcony: outdoor space with no roof) are not
  in it, as they are in no net, gross internal or gross external area.
- A plan with open outdoor space also gets the other figure, with the open outdoor space counted,
  and the answer says which is which. A plan without it answers as before.
- Every set-back distance is given to the enclosed building, and, when open outdoor space comes
  nearer, beside it the distance to the open outdoor space's edge.

## Design

- `packages/floorplan/src/geometry/site.ts`: `siteMeasures` measures the footprint from the plan
  less the walls that bound open outdoor space and no room (`buildingPlan` of `outdoor.ts`, with
  roofed outdoor space left as it is, so a porch still counts). The tail of the function (edges,
  faces, coverage) becomes one inner function over a footprint. When the plan has open outdoor
  space and the whole plan's footprint differs, the same is worked out for the whole plan and
  returned as `withOpen` (footprint, edges, faces, coverage, covered); otherwise `withOpen` is null.
  The main fields keep their names, so every reader gets the enclosed building without change.
- Decision: open outdoor space bounded only by walls shared with a room is not cut from the shape;
  only walls that bound outdoor space and no room are (`outdoorOnlyWalls`), the rule the gross areas use.
- `packages/cli/src/quantities/site.ts`: words the second coverage line and the distance to the open
  outdoor space beside each edge's; the data has `coverage.withOpenOutdoor` and per-edge `distanceWithOpen`.
  The rule text says what is left out.
- `packages/cli/src/quantities/limits.ts`: the rule text of `plot_coverage` says the open outdoor space is left out.
- The CLI file's English is counted by `ownWords.test.ts`; the counts are raised there as the test asks.

## Done

- A test in `geometry/__tests__/site.test.ts`: a house with a terrace (open outdoor room) has
  coverage and distances to the house alone, `withOpen` has the terrace in; a roofed porch counts in
  both; a plan with none has `withOpen` null.
- A test of the CLI answer (lines and data).
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `contract.test.ts`, `npm run scoreboard`.
