# CNT-41: write the plot, streets, set-backs and north through a tool and rooms text

## Outcome

An agent that can only call tools, or only write rooms text, can state where the building sits
and on what plot, and never has to edit `plan.json` by hand or guess the schema:

- Rooms text takes the site in lines of its own: `plot 12 x 25 [at x,y]` or
  `site boundary x,y x,y ...`, `street south` (or `street edge 1`), `setback all 2`,
  `setback street 5`, `setback west 40 [assumed]`, `north 135` (or `north up-left`,
  `north 30 clockwise`), `site origin x,y`, `site location <lat>,<lon>`, `site elevation <m>`,
  `site ground <m>`, `site country <name>` and the site's things (`site tree oak at 3,4 canopy 5`,
  `site path p1 0,0 0,10 width 1.2`, fences, gates, paving and pools). The read-back
  (`grid describe --as rooms`) writes the same lines, so writing it again keeps the site, and a
  north written by hand is read, never passed over without a word.
- `grid_set_site` sets the boundary (its corners, or a plot's width and depth), the street edges
  (by the side of the drawing they face or by number), the set-backs, north, and where the
  building is on the earth, and answers with the plot's area (in acres too on a plan shown in
  feet and inches), the coverage, whether open decks and roofed porches count in it, and the
  distance from each edge against the set-back asked.
- `grid_change_site` adds, moves, resizes and removes the site's things: trees, paths, paving,
  pools, fences and gates, one call for one change, and says when a thing lies outside the plot.
- `grid_measure what=site` on a plan with no boundary says how to add one (the tool or the rooms
  text line), and on any plan says which outdoor space the coverage counts and which it leaves out.
- A plan that states no north says how to set it with the tool or a `north` line.

## Design

- `packages/floorplan/src/rooms/site.ts` (new): the site lines. `SiteLines` reads each line as it
  comes (refusing a malformed one with its line and the form it takes) and, once the walls are
  worked out, makes the plan's `site` and `north`: a side word is turned into the boundary's
  edges whose outside faces that side of the drawing (C4: north is up the drawing, as every rooms
  line reads sides); a `plot` with no `at` is centred on the building's walls and the answer says
  so; things with no id get `<kind>-<n>`. The site is checked with the plan's own `SiteSchema`,
  each refusal naming its line. `siteLines(plan)` writes a plan's site back as these lines, and
  `writtenSite(fileSite, textSite)` decides what `grid write` keeps: a boundary in the text brings
  its streets and set-backs with it (all three replace the file's), each other field replaces the
  file's only when written, and things written replace the file's things; anything not written
  stays as the file has it. Edge words and sides are shared with the tool (`edgesFacing`,
  `readSetback`, `readNorth`), so the two read them the same way.
- `rooms/compile.ts`: only the dispatch of the new line words to `SiteLines`, one call in `emit`,
  and the header's grammar. Kept small: another change is editing the room line there.
- `rooms/read.ts`: the header lines include `siteLines(plan)`.
- `packages/cli/src/command/write.ts`: the file's `site` and `north` merged with the text's by
  `writtenSite`, and the plot's one or two lines (`siteDescription`) in the answer when the text
  wrote any site line.
- `packages/cli/src/edit/site.ts` (new): `setSite` and `changeSiteThing`, each a `Patch`
  (`plan.site`, `plan.north`, and `parts` for a thing moved or resized, so a thing keeps every
  field as written). Each refuses with nothing written when the site would not be read
  (`SiteSchema`), naming the field. A new boundary keeps the streets and set-backs that still name
  one of its edges and says which it dropped.
- `packages/cli/src/mcp/siteTools.ts` (new): the two tools, through `writeChange` like every
  change, placed after `grid_tidy` and before `grid_save_view`: they change the ground, never the
  building. Points are given as `"x,y"` text, as rooms text writes them, since tool arguments take
  lists of text. The answer of `grid_set_site` is the change, then `siteAnswer`, the same lines
  `grid_measure what=site` gives.
- `packages/cli/src/quantities/site.ts`: the no-boundary line names the tool and the line; the
  plot's area carries acres when the plan is shown in feet and inches (data: `acres`); a line says
  what the coverage counts (enclosed rooms and roofed outdoor space such as a porch or carport)
  and leaves out (open outdoor space such as a deck or terrace), naming the plan's own.
  `quantities/facing.ts`: the no-north line names the tool and the line.
- Docs: `docs/rooms-first.md` (the grammar, from `roomsGrammar.ts`, which gets a `site` topic),
  `docs/tool-server.md` (two rows and the plot section), `docs/commands.md` and `AGENTS.md` (the
  count of tools). No new convention: the site's fields are C7, C10 and C13 as they stand. No new
  message code in the record: rooms text says `rooms/site` and `rooms/plot-centred`, as its other
  lines say theirs.

Decisions taken alone:

- Sides in site lines are the drawing's sides, as in every rooms line, not the real north.
- `street` and `setback` lines need the boundary in the same text, so an edge's number or side
  always means the boundary written beside it; the read-back writes all of them together.
- `north <degrees>` is counter-clockwise from up, as the plan file holds it; `clockwise` after the
  figure reads it the other way, as a compass arrow drawn on a sketch is usually measured; words
  (`up`, `left`, `up-right`) name where the arrow points on the drawing. Every answer says where
  north points in words.
- No new kinds of site thing: a jetty or boardwalk is a `path` with its width.
- No `grid edit` verb: its lists are split at commas, which points are written with. The command
  line writes the site with rooms text (`grid write`).

## Done

- `packages/floorplan/src/rooms/__tests__/site.test.ts`: each line written gives the plan's site
  and north; `street south` and `setback west` find their edges on a plot and on a shape at an
  angle; a plot with no `at` is centred and said; a malformed line, a side no edge faces and a
  street with no boundary are refused with the line; the read-back writes the site lines and
  writing them again gives the same site; `writtenSite` keeps what the text does not write.
- `packages/cli/src/mcp/__tests__/siteTools.test.ts`: `grid_set_site` on the lab's house writes
  boundary, street, set-backs and north and answers with plot area, coverage and distances; acres
  on a plan in feet and inches; the coverage line on a plan with a deck and a porch; a refusal
  writes nothing; `grid_change_site` adds a gate, moves a tree, widens a path and removes a
  thing, each keeping the rest of the file; a thing outside the boundary is said;
  `grid_measure what=site` with no boundary names `grid_set_site`.
- `grid_write_rooms` with site lines over a plan with things keeps the things and answers with the
  plot line (`writeRooms` test).
- `tools.test.ts` (order, a call for each), `everyPath.e2e.test.ts` (plan and out), the grammar
  test, `ownWords.test.ts` counts.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `npm run scoreboard`.
