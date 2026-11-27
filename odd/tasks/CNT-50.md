# CNT-50: Keep the address, the name, the language, the units and north with the plan

## Outcome

A plan keeps the site's address and its own name ("Harbour House") as the person wrote them, so
an agent coming back to the plan finds them in the file and not in its notes. Grid never looks
an address up and never checks it against a map. One tool call, `grid_set_plan`, sets what a
person says about the plan as a whole: its name, the site's name and address, the language
Grid writes in, the units lengths and areas are shown in, the decimal mark, north, the country
it will be built in and the floors' names. `grid describe` says the site's name and address,
and the sheets and the band under a drawing carry them.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `site.address` and `site.name`, free text under
  the text rule and a length limit, added to C7's site (no new convention number). A wrong key
  is still named as unknown, as every other.
- `packages/floorplan/src/rooms/site.ts`: `site address "..."` and `site name "..."` lines, read
  as the `site country` line is and written back by `siteLines`, so writing a plan again from
  its rooms text keeps them. The compiler (`compile.ts`) is not touched: its site lines already
  go to `site.ts`. A `display ... language` word in rooms text belongs to the compiler and is
  left for later.
- `packages/cli/src/edit/site.ts`: `setSite` takes `address` and `name`, and `remove` takes them
  out. `grid_set_site` gets `address` and `site_name`.
- `packages/cli/src/edit/plan.ts` (new): `setPlan`, the plan-wide settings as one patch: the
  plan's `name`, `display` (`language`, `length`, `area`, `decimal`, `precision`), floor names
  by floor id (a floor in the floors list renamed in its own record; a floor only named by its
  walls and rooms added to the list with its level), and the site's fields through `setSite`.
  Its receipts are keys of the message files.
- `packages/cli/src/mcp/planTool.ts` (new): `grid_set_plan`, registered after the site tools.
  `units` takes `m`, `cm`, `mm` or `ft-in` (and the words people use: metres, feet), never a key
  of the file, so no agent writes `units` itself.
- Shown: `grid describe` (person and agent, longer forms) gets one line with the site's name and
  address; the sheet's cover and title blocks carry the address after the project's name, and
  the project falls back to the site's name; the band under a drawing shows the plan's title and
  the address.
- Docs: `docs/plan-file.md`, `docs/tool-server.md`, `docs/rooms-first.md` where they list site
  fields and tools.

## Done

- Schema tests: the address and name are read and kept; one too long or with a control
  character is refused naming the field.
- Rooms text: `site address` and `site name` read, and kept through a read-back and a write.
- `setSite` and `grid_set_site`: set and remove an address and a name.
- `grid_set_plan`: language, units, decimal mark, north, country, address, site name and floor
  names in one call; a units word Grid does not know is refused with the ones it knows; a call
  with nothing to set is refused.
- describe, sheet pages and the drawing band show the address.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the tools
  test's order and count, the own-words count, and the scoreboard no worse.
