# 2026-11-28: street names on the site plan (VEW-88)

## For people

- A plot's street edges can carry the street's name: say "the front is on Harbour Road" and the
  site plan (`grid draw --site`) writes the name along that edge, outside the plot, in place of
  the plain word Street. Rooms text writes it as `street south "Harbour Road"` (VEW-88).

## For agents

- `grid_set_site` takes `street_names`, each `"<edge> <name>"` with the edge a number or a side of
  the drawing (`"1 Harbour Road"`, `"south Quay Street"`); an edge named that is not on a street is
  put on one, `[]` takes the names out, and an empty name or one over 120 characters is refused
  with nothing written. A name stays while its edge is on a street and is dropped with it (said
  in what was not kept). The plan file holds them in `site.streetNames` (`edge`, `name`).
- `grid_view kind=site` writes each name along its street edge; its text lists each street edge
  with its name or "no name", and `site.streets` in its data gives each one's `name` (null when
  none). `grid_measure what=site` names the street after the edge, and `grid_describe as=rooms`
  writes `street edge 1 "Harbour Road"`. No new code in the record.
