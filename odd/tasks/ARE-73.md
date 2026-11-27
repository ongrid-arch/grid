# ARE-73: activity zones in front of fixtures, measured per kind

## Outcome

An agent asked "is there a 400 mm zone either side of the WC's centre line, 700 mm deep?" or
"which fixtures in this block lack their clear floor?" asks it in one call and gets numbers:

- `grid_measure what=activity` measures an activity zone in front of every fixture: a box on the
  fixture's centre line, as deep as its front figure and as wide as its width figure, each given
  per kind (`per_kind: {"toilet": {"front": 0.7, "width": 0.8}, "basin": 0.6}`), for every kind
  (`clearance`, `width`), or else the item's own clearance, its kind's library entry, or Grid's
  own indicator, and the answer says whose figure each is.
- For each zone it gives the clear depth straight out, and the clear width to each side of the
  centre line, with the sides in compass words by the plan's north ("0.30 m to the west of its
  centre line, under the 0.40 m asked"), what stands in it, the doors whose swing reaches into it
  and the other zones it overlaps.
- Units standing side by side with one front (a kitchen run of several units) are one run with
  one zone, so a unit's neighbour does not read as 0 mm beside it, and zones of one run never
  overlap each other.
- `room` is optional: without it every room is measured. Only the zones that fall short, have
  something in them or overlap are listed unless `all` is true; the rest are counted. A block of
  240 units answers in well under a second and a few kilobytes.
- Every answer closes with one sentence on what it took off: the fixtures, door swings and wall
  faces it measured clear of, and what it left out.
- A firm's `fixture_clearance` standard takes `width` too, and is then measured as the same zone;
  its `kinds` are any kind the registry holds (new fixture kinds included), not a fixed list.

## Design

- `packages/cli/src/quantities/activity.ts` (new): the zones. A fixture's frame from its
  footprint (back left, back right, front right, front left); runs found by union of fixtures on
  one floor whose fronts face the same way on one line and whose sides touch within
  `wallContact`, only for kinds that keep no clear floor at their sides (`sides: false` in the
  kinds registry, such as a kitchen run), so two WCs side by side keep a zone each. Each zone is
  measured by rays: sideways from points on the centre line within the zone's depth (the clear
  width each side), then straight out from points along the front across the part of the width
  that is clear (the clear depth), to the room's outline, its holes and the other fixtures'
  footprints near it (`fixturesOf(...).near`). A point of the zone that is not on the room's free
  floor reads as 0. Door swings come from the core's `doorSweeps` (an arc flattened to a convex
  polygon), and overlaps are convex clips; an overlap narrower than the new tolerance
  `zoneOverlap` is touching, not standing in. Zone overlaps are found by box first.
- Figures: `per_kind` keys are checked against the kinds registry (`isItemKind`), so kinds added
  later need no change here. The default depth is the item's `clearance` (stated, or filled from
  its library entry), else the first entry of its kind in the plan's library (`planLibrary`, the
  plan's own then Grid's), else `useClearSpace`; the default width is the fixture's width (a run's
  length for a run).
- Sentences: new keys `activity.*` in `packages/floorplan/src/messages/en.ts` and `es.ts`
  (Spanish written as a draft, as the file is). `activity.ts` holds no English sentence.
- `packages/cli/src/mcp/readTools.ts`: `what=activity` and its arguments `per_kind` (object) and
  `all` (boolean) in `grid_measure`; `room` optional for it. Registration only, no new tool.
- Firm (`packages/cli/src/firm/standards.ts`, `measure.ts`, `packages/rules/src/result/firm.ts`):
  `width` on `fixture_clearance` (and `FirmStandard.width`, null when unstated); with it, the
  measured figure is the zone's clear depth over that width on the centre line, and the line says
  the side clear widths. `kinds` read from `itemKinds()`.
- Tolerance `zoneOverlap` (0.005 m) in `geometry/tolerances.ts` and `docs/tolerances.md`.
- Docs: `docs/tool-server.md` (use indicators section), `docs/firm-standards.md`.
- Decision: a new measure (`activity`) rather than changing `what=use`, so the room-by-room
  indicators answer as before; `what=use` keeps its per-face measure.
- Decision: zone overlaps and door swings are listed as findings with the zone, never as a rule.

## Done

- `packages/cli/src/quantities/__tests__/activity.test.ts`: a WC beside a side wall 0.3 m from
  its centre line is short to that side (in compass words) and clear to the other; per-kind box
  figures and whose figure each is; a kitchen run of three abutting units reads as one zone with
  no 0 mm sides; two overlapping zones and a door swing into a zone are reported; only shortfalls
  by default and all with `all`; no room measures every room; 240 units measured fast; the
  closing sentence.
- `packages/cli/src/mcp/__tests__/activity.test.ts`: the tool call, refusals of an unknown kind
  and a bad figure.
- Firm tests: `width` read, refused for other measures, kinds from the registry, the zone measure.
- Checks: build, typecheck, lint, vitest on the folders touched, the tolerances test, ownWords and
  contract tests, scoreboard.
