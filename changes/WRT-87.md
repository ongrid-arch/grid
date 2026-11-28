# 2026-11-28: a plan read back as the rooms text it was written from (WRT-87)

## For people

- `grid describe --as rooms` gives back the rooms text a plan was written from, units, repeats,
  copied floors, rooms through floors, comments and your own lengths (`1400` under `display mm
  numbers mm`) as you wrote them, while that text still writes the plan; only its `based on` line
  is new. A hotel floor written in 17 lines reads back in 18, not 74 (WRT-87).
- What a tool placed since (an item, a column, a stair, a note) is added at the end of that text
  as its own lines, so a change after a tool's edit is one line, not the whole plan again (WRT-87).
- A display line may name the plan's language (`display mm language es`, or `display language
  es`): `grid write` sets it, and the read-back writes it, so the language and the plan name stay
  with a plan written to another file (WRT-87).
- What no rooms text holds (part types, the trace image, facts on walls and openings) is named in
  a comment line at the top of every read-back, so writing it to a new file drops nothing unseen
  (WRT-87).

## For agents

- `grid write`, `grid_write_rooms` and `grid_write_building` read `language <tag>` at the end of a
  `display` line (a line of only `display language <tag>` too). `grid write` sets the plan's
  `display.language` from it, over the language the call records; a building's text drops it, as
  the language is the whole plan's. A tag that is no language is left on the line and refused as
  before.
- The plan's `written` record gains `text`: the rooms text Grid last wrote the plan from, as
  given. Optional; a plan with none reads back as before.
- `grid describe --as rooms` and `grid_describe as=rooms` give `written.text` back when, written
  again, it gives the plan the file holds: the `based on` line set (or added after the `plan`
  line) to the plan's revision, the `plan` line to the plan's name when it changed, the display
  line's `language` to the plan's, and the comment lines an earlier read-back put above it taken
  out. Parts of `items`, `stairs`, `columns`, `grids`, `bays`, `ramps`, `annotations`, `sketch`
  and `buildings` the text has no line for are added at its end as their lines. Otherwise the
  plan is worked out as before, now with `language <tag>` on its display line (`display language
  es` when the display states nothing else).
- A read-back may open (after the label) with `# Not in this text, and kept by grid write only when the
  text is written over this plan file: <keys>.`, naming the plan file's keys the text does not
  write (`types`, `referenceImage`, `views`, `walls facts`, `openings facts`, `floors facts`,
  `display words` and the like). No new code in the record.
