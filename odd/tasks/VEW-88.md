# VEW-88: street names on the site plan

## Outcome

A person can say which street a plot's edge is on ("the front is on Harbour Road") and Grid
keeps the name with the plan: `grid_set_site` writes it, the site plan (`grid_view kind=site`,
`grid draw --site`, SVG and PNG) writes it along the street edge in place of the plain word
Street, and it is read back by `grid_view kind=site` (text and data), `grid_measure what=site`
and rooms text (`grid describe --as rooms`, which writes it again without losing it). A name that
is empty or longer than a name may be is refused, saying which edge and the limit. An unnamed
street edge is drawn as before.

## Design

- Plan file (`packages/floorplan/src/types/floorplan.ts`, C13, BRF-3's site): `site.streetNames`,
  an optional list of `{ edge, name }`, each edge one that `streets` names, once. The street edges
  stay a list of numbers, so every reader of `streets` is unchanged and old plans read as before.
  No new convention: it is an optional field of C13's site, described in its header.
  Decision: a list beside `streets` rather than turning `streets` into a mix of numbers and
  objects, which every reader (the plot, the checks, rooms text, the edits) would have had to
  tell apart. The name is plan text (`text('name')`, at most `NAME_MAX` characters), so no new
  limit or tolerance.
- The plot (`geometry/plot.ts`): each boundary edge carries its street name (`streetName`, null
  when none), so `sitePlan` (`geometry/sitePlan.ts`) gives each street its `name`.
- The picture (`packages/viewer/src/picture/sitePlan.ts`): a named street edge is labelled with
  its name, along the edge, outside the plot; an unnamed one keeps the word Street.
- Writing (`packages/cli/src/edit/site.ts`, `mcp/siteTools.ts`): `grid_set_site` takes
  `street_names`, each `"<edge or side> <name>"` (`"2 Harbour Road"`, `"south Harbour Road"`). An
  edge named that is not yet on a street is put on one, and the answer says so; `[]` takes the
  names out. Changing the streets or the boundary keeps the names of the edges still on a street
  and says which were dropped; taking the streets or the boundary out takes the names with them.
  An empty or overlong name is refused before the plan is touched. The plan is changed through
  the patch on a copy, never the loaded plan.
- Reading back: `grid_view kind=site` lists each street edge with its name and gives `name` in
  `site.streets`; `grid_measure what=site` names the street; rooms text writes
  `street edge 2 "Harbour Road"` (`rooms/site.ts`, its reader and writer; the compiler
  `rooms/compile.ts` is not touched, it hands site lines to `rooms/site.ts`).
- Docs: `docs/plan-file.md` and the site tool's page; the changelog fragment `changes/VEW-88.md`.
  No new message code.

## Done

- `packages/floorplan`: the schema takes a street name on a street edge and refuses one on an
  edge not on a street, an edge named twice, an empty name and an overlong one; `sitePlan` gives
  the street its name; rooms text reads `street edge 2 "Harbour Road"` and writes it back.
- `packages/viewer`: the site plan's SVG writes the name along the street edge, and the word
  Street on an unnamed one; the PNG is drawn from the same SVG.
- `packages/cli`: `grid_set_site street_names` writes the name, puts an unnamed edge on the
  street, refuses an empty or overlong name, keeps and drops names as the streets change;
  `grid_view kind=site` and `grid_measure what=site` read the name back.
- Build, type check, lint, the tests of the folders touched, the floorplan purity test and the
  scoreboard.
