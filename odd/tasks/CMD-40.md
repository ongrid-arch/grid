# CMD-40: the documentation ships with the package and is served as resources

## Outcome

An agent or a person who installs `ongrid` from npm, with no copy of this repository, can read
every page of Grid's documentation and the plan file's JSON Schema, and does not need to read
the bundle or the source to learn what a plan may hold (site, facts, finishes, phases, stairs,
ramps). The tool server lists each documentation page as a resource (`grid://docs/<page>`)
beside the guide (`grid://guide`), the rooms grammar (`grid://guide/rooms`) and the schema
(`grid://schema/plan`). The package's README says where each is and links the pages it ships.
A page of recipes (a listing plan, a house over three floors, a shop with zones, a plot with a
building) gives a start for the four things people ask for first. No page sends an npm reader
to a file the package does not carry.

## Design

- `docs/` is in the package: `pack.mjs` copies it beside `grid.mjs` and the manifest lists
  `docs/`, so the README's relative links work in the unpacked package.
- The pages are served from the bundle, not from the package folder: nothing outside
  `fs/projectFiles.ts` reads a file. The build imports each page as text (`loader` `.md` in
  esbuild, a small transform in `vitest.config.ts`), and each is its own chunk, loaded only when
  a host reads it. `src/guide/docPages.ts` lists them; a test fails when a page of `docs/` is
  missing from it.
- `grid://docs/<page>` for every page except the guide, which keeps `grid://guide`. A page's
  title and one-line description are the ones in `docPages.ts`; a test holds the title to the
  page's first heading.
- `docs/recipes.md` is new, with its row in the README's table. Its rooms texts are written by
  a test, and its site block is read by the plan file's schema.
- Pages that pointed at a source file now say what the file holds, or point at a page or a
  resource: the rooms page's grammar line, and the tool server's note that a ramp cannot be
  stated (a plan states ramps since CNT-19).
- The plan JSON Schema already exists (`grid://schema/plan`, `plan.schema.json`); it is listed
  in the README beside the pages.
- Not done: the plan schema's descriptions, and a search across the pages.

## Done

- `src/guide/__tests__/recipes.test.ts`: each recipe's rooms text writes with no problem and the
  site reads.
- `src/guide/__tests__/docResources.test.ts`: every page of `docs/` but the guide is a listed
  resource that reads back as the page, with its title; the README names the resources; no page
  names a path the package does not carry.
- `listing.test.ts` and `install.e2e.test.ts`: the manifest's `files` and the unpacked package
  hold `docs/`, and the README links resolve inside it.
- `npm run typecheck`, `npm run lint`, the `packages/cli` tests, `npm run scoreboard`.
