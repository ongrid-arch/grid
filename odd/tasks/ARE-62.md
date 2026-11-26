# ARE-62: the site's ground level in rooms text and a tool, named in every ground note

## Outcome

An agent drawing a basement, a sunken car park or a house on a slope can state where the ground
outside is without editing `plan.json`, and is told how whenever Grid says the plan states none:

- Rooms text takes `ground <m>` on a line of its own: the level of the ground outside, in metres
  from the ground floor's floor level (the datum of a floor's `elevation`), so `ground -0.15` for
  a floor 15 cm above the ground and `ground 0` for a floor at the ground. `ground 0.15 below` and
  `ground 1.2 above` say the same with the distance and its way, so no sign has to be guessed;
  `ground level <m>` and `ground at <m>` are read too, and a length may carry its unit. The older
  `site ground <m>` still reads; writing both is refused with the line the first is on.
- The read-back (`grid describe --as rooms`) writes the plan's ground as `ground <m>`, so writing
  it again keeps it.
- `grid_set_site` already takes `ground`; its description now says when to use it (a basement,
  a slope, a floor raised above the ground) and that it is the level the sections, the 3D ground
  and the below-ground check read.
- Every answer that says the plan states no ground level names both ways to state it: the
  skipped check's reason in `grid_check`, the section's note on the ground it took, the facade's
  ground line, the access measure's "cannot tell" and the building height's rule. A raw `site`
  line is refused naming the `ground` line among the site's lines.

## Design

- `packages/floorplan/src/rooms/ground.ts` (new): `groundOfWords(words, at, plain)`, the words
  after `ground` read into a level, refused with the forms it takes. Its own module, since other
  changes edit the rooms text compiler at the same time.
- `packages/floorplan/src/rooms/site.ts`: `ground` joins `SITE_LINE_WORDS`, and `SiteLines.read`
  sends it to `groundOfWords` and keeps it as the `ground` field, the same one `site ground`
  writes, so a second one is refused by the existing "written once" rule and nothing else in the
  compiler changes. `siteLines` writes `ground <m>`.
- `packages/floorplan/src/rooms/compile.ts`: the header's grammar line only.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: one sentence, `site.ground.how`, the two
  ways to state the ground, said by every answer that finds none; the skipped check's reason and
  the raw-site refusal carry it in their own words. The drawing's own labels (the facade's and
  the section's note under the picture) stay as they are: they are for the person, and a tool
  name does not belong on a sheet.
- `packages/cli`: `sectionAnswer.ts`, `readTools.ts` (facade), `quantities/access.ts` and
  `quantities/limits.ts` add `site.ground.how` where they say the ground is not stated;
  `mcp/siteTools.ts` the `ground` argument's description and the tool's; `mcp/roomsGrammar.ts`
  (and `docs/rooms-first.md`, which holds it word for word) the `ground` line in the site topic.
- No new convention, message code or tolerance.

## Done

- `rooms/__tests__/ground.test.ts`: `ground -0.15`, `ground 0`, `ground 0.15 below`, `ground 1.2
  above`, `ground level -1`, a length with its unit, and refusals (no figure, a negative with
  below or above, words left over, `ground` with `site ground`), each with its line; the
  read-back writes `ground <m>` and writes again to the same plan.
- A test that every English message saying the ground level is not stated, other than the
  drawing's own labels, names `ground <m>` and `grid_set_site`; tests on the section, facade,
  check and access answers of a plan with no ground.
- `grid_set_site ground` sets `site.ground` and the section then reads it (already covered;
  rechecked).
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan` and
  `packages/cli` (and the own-words, contract and tolerances tests), `npm run scoreboard`.
