# 2026-11-26: the documentation ships with the package and is served as resources (CMD-40)

## For people

- The npm package now carries the documentation (`docs/`), and its README says what each page is
  and how an agent reads it, instead of pointing at the repository (CMD-40).
- A new page, `docs/recipes.md`, starts the four things people ask for first: a flat for a
  property listing, a house over three floors, a shop with zones, and a plot with a building on
  it (CMD-40).
- The rooms page and the tool-server page no longer send a reader to a source file; the tool
  server's page says a ramp between two floors can be stated (CMD-40).

## For agents

- The tool server lists every page of the documentation as a resource, `grid://docs/<page>`
  (`recipes`, `rooms-first`, `commands`, `tool-server`, `plan-file`, `conventions`, `brief`,
  `firm-standards`, `library`, `areas`, `tolerances`, `result-contract`, `languages`), beside
  `grid://guide`, `grid://guide/rooms` and `grid://schema/plan`. Read a resource with the
  protocol's `resources/read`; a host that has no way to read one can read the same pages in the
  package's `docs/` folder. No new code in the record.
