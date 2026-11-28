# 2026-11-28: markers keep the brief, and the brief's changes are said (CMD-57)

## For people

- A marker now keeps the brief beside the plan as well as the plan, and `grid diff` since that marker lists how the brief changed: each wish weakened (a must made a should, a smallest figure lowered, a largest raised, a figure taken out), removed, changed, tightened or added, the weakened and removed first. Writing a brief over the one kept, whole or one wish at a time, says what it replaced and weakened, and the answer holds the old brief to put it back (CMD-57).

## For agents

- `grid_mark_start` keeps the brief beside the plan with the marker (`brief` in `plan.markers.json`, the brief's JSON text, or null for none) and says so; data gains `brief` (true when the marker keeps one). `grid mark` does the same.
- `grid_diff`: after the issues, `Brief, since then (<n> changed, <m> weakened or removed):` and one line per wish (`<where> weakened, it asks for less: <field> <before> → <after>; …`, `<was> removed: …`, `<where> added: …`, `… tightened: …`, `… changed: …`), or `Brief: the same wishes as then.`, or `Brief: not compared, <why>.` when the earlier version is not a marker or the marker was set before markers kept the brief. Data gains `brief`: `compared`, `why`, `changes` (`kind` `added`, `removed`, `weakened`, `tightened` or `changed`, `where`, `was`, `before`, `after`, `fields` of `field`, `before`, `after`, and `text`); null for `since: phase`.
- `grid_write_brief`: a write over a brief kept (`replace: true`, `add`, `remove` or `update`) adds `It replaced the brief kept before (<n> changed, <m> weakened or removed):` with the same lines, or `The brief kept before held the same wishes.`. Data gains `replaced`: `changes` as above and `previous`, the brief replaced in the form `brief` takes; null when no brief was replaced. No new code in the record.
