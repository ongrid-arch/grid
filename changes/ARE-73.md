# 2026-11-27: activity zones in front of fixtures, measured per kind (ARE-73)

## For people

- Ask for the clear floor in front of fixtures as a box on each one's centre line, per kind,
  such as a WC's 700 mm deep and 400 mm either side of its centre line: Grid gives the clear depth
  and the clear width to each side, by compass, what stands in the zone, the doors that swing into
  it and the zones it overlaps. A kitchen run of several units reads as one run, not as units with
  0 mm between them. Without a room it measures every room, and lists only the zones that fall
  short unless you ask for all. A firm's standard for the floor in front of a fixture can give a
  width too, and its kinds are any fixture kind Grid holds (ARE-73).

## For agents

- `grid_measure` takes `what=activity`: each fixture's activity zone, a box on its centre line as
  deep as its front figure and as wide as its width figure. Figures: `per_kind`
  (`{"toilet": {"front": 0.7, "width": 0.8}, "basin": 0.6}`, kinds from the kinds registry), else
  `clearance` and `width` for every kind, else the item's own clearance, the first library entry of
  its kind, or `useClearSpace`; the width is the fixture's own when none is given. `room` is
  optional; `all: true` lists every zone, else only those short, with a fixture or door swing in
  them, or overlapping another. Its data: `zones` (each with `items`, `room`, `at`, `figure`
  with `from` = `person`, `item`, `library` or `grid`, `measured` `{front, left, right}`, `ways`
  by compass, `short`, `standing`, `doors`, `overlaps`), `measured`, `listed`, `northStated` and
  `leftOut`. Units side by side with one front, of kinds with `sides: false`, are one zone. The
  answer closes with one sentence on what it took off and what it left out.
- `firm-standards.json`: `fixture_clearance` takes `width` (in the standard's unit); the part is
  then measured as the activity zone, its figure the clear floor straight out over that width, and
  the record's `firm.standards[]` carries `width`. `kinds` takes any fixture kind the registry
  holds. No new code in the record.
