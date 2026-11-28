# CMD-57: markers keep the brief, and the brief's changes are said

## Outcome

The brief (`<plan>.brief.json`, BRF-1) is what the person asked for, and the plan is measured
against it. Today a marker keeps the plan alone, so a reviewer can loosen a wish (a must made a
should, an at least lowered, a wish taken out) and no comparison shows it, and an agent that
writes a whole new brief over the old one cannot get the old one back. After this change:

- `grid_mark_start` and `grid mark` keep the brief beside the plan with the marker, as it is when
  the marker is set; the answer says whether there was one to keep.
- `grid_diff` (and `grid diff`) lists how the brief changed between the two versions when both
  are markers that kept it, or a marker and the brief now: each wish added, removed, weakened,
  tightened or changed, by its place (`rooms[2]`, `figures.door_width`), with the fields before
  and after, the weakened and removed first. When the earlier version keeps no brief (git, `last`,
  a revision, a date, a marker set before this change) it says the brief was not compared and why.
- `grid_write_brief`, when it writes over a brief or changes one wish of it, says what it replaced:
  the wishes removed, weakened, tightened, changed and added, and gives the brief it replaced in
  its data, so it can be put back with `brief` and `replace: true`.

## Design

All in `packages/cli/src`, in the versions and brief code.

- `versions/markers.ts`: a marker may hold `brief`, the brief's JSON text as the brief file holds
  it, or null when there was no brief beside the plan. A marker without the field was set before
  markers kept the brief; it is read as before. The markers file's largest size grows by a brief
  per marker.
- `versions/briefs.ts` (new): the brief a marker keeps (`briefForMarker`), the brief of a version
  for the comparison, and `compareBriefs`, which pairs the wishes of two briefs by what they are
  about, not by their place (a room wish by its name or use, floor and fact, in order; a touch by
  its two rooms; an open wish by its quote; the footprint, each figure and people by their key),
  and says of each pair which fields changed. A change is weakened when it asks for less: a must
  made a should, a least figure lowered or a most figure raised (by the figure's own `most`), or
  a figure taken out of the wish. Tightened is the other way; anything else (a quote, a source,
  an about size, an avoid) is changed. A wish taken out is removed and counted with the weakened.
  It compares the briefs as `briefJson` writes them, so the fields are the file's own.
- `versions/diff.ts`: `diffSince` adds the brief comparison to the run, from the marker's brief
  and the later version's (the brief file now, or the later marker's); `diffText` says it after
  the issues and `diffData` gives it as `brief`.
- `versions/words.ts`: the new sentences, as the change log's are.
- `mcp/diffTools.ts`, `command/diff.ts`: the marker keeps the brief; the answer says so.
- `mcp/briefTool.ts`: on a write over a brief kept, the comparison of the old brief with the new
  and the old brief whole, `replaced` in the data (null when nothing was replaced).

Decisions: the brief is kept in the markers file, not in a file of its own, so a marker stays one
record and rolls off whole. `grid_restore` still puts back the plan alone: putting a brief back is
`grid_write_brief` with the brief the diff or the write answered, which a person can see. The
checkpoints of the change log keep the plan alone, as before.

## Done

- `versions/__tests__/briefs.test.ts`: the pairing and the kinds of change (must to should, an at
  least lowered, a step raised, a wish removed, a room wish moved to another place unchanged).
- `mcp/__tests__/`: a marker set with a brief, the brief weakened and a wish removed, and
  `grid_diff` listing both; a marker set before keeping briefs says it was not compared;
  `grid_write_brief` with `replace: true` and with `remove` says what it replaced and returns the
  old brief.
- Build, typecheck, lint, the tests of the folders touched and of `packages/cli/src/mcp` and
  `packages/cli/src/command`, the sentence counts, and the scoreboard.
