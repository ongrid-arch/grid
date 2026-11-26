# ARE-59: the areas read the plan's own country

## Outcome

A plan that states `site.country` gets the gross measure usual there from `grid_areas` (and every
other reader of the areas) with no `country` argument. The argument only overrides the plan's.

## Design

- `planAreas` in `packages/cli/src/quantities/areas.ts` takes the request's country, else the
  plan's place from `planPlace` in `@ongrid/rules`, the same reading `grid check` uses, so a name
  or a three-letter code in the plan works too.
- `grid_areas` words (tool and `country` argument) say the plan's country is read first.
- The `country` argument keeps its two-letter rule; widening it to names is not part of this change.

## Done

- A test in `areaMeasures.test.ts` fails before and passes after: a plan stating GB gives the inside
  face first with no argument, and `country: US` overrides it.
- Type check of `packages/cli`, lint, the touched tests, `ownWords` and `tolerances` pass.
