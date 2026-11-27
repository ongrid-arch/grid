# 2026-11-27: types, finishes and curves in a comparison (WRT-86)

## For people

- `grid diff` names a wall, door or window type added, removed or changed, with its figures and
  the parts that take it, and each part that takes another type says which it was and which it is
  (WRT-86).
- A room whose finishes changed is a changed room in `grid diff`, surface by surface, instead of
  "Changes: none" (WRT-86).
- A curved wall that changed gives its radius, bulge and sweep before and after, and the picture
  draws its old curve outlined under the new one instead of the wall as unchanged (WRT-86).

## For agents

- `grid_diff` and `grid diff` add a change line for each type of `types` added, removed or changed,
  after the massing's and before the rooms': `Wall type "Concrete 250" ("conc") added: thickness
  0.25 m; taken by wall "ext-east"`, `... removed; it was taken by 2 walls: ...`, `... thickness
  0.30 m → 0.35 m; taken by 4 walls: ...` (at most four parts named, then how many more). The
  verdict lists them as it lists the massing's lines; with `rooms`, a type line is outside unless
  every room of its parts is named.
- A wall, door or window line adds `type "<name before>" → "<name after>"` (`none` for no type,
  the id when no type has it). The id diff (`compareBuildings().diff`) compares `wallType`,
  `doorType` and `windowType`, so a part that only took another type is a modified part, and
  `wallType` is a wall figure in a plan written rooms first.
- A room line adds `<surface> finish <before> → <after>` (`not stated`, `no skirting`), `finish of
  the face of wall <id> ...` and `finish bands <before> → <after>`; the room's status is `changed`.
- A wall line whose `arc` changed says `curve radius <r> → <r> m, bulge <b> → <b> (sweep <d>° →
  <d>°)`, `made curved: radius ..., bulge ... (sweep ...°)` or `made straight (was curved: ...)`
  instead of `curve changed`, `made curved` or `made straight`. The bulge is the tangent of a
  quarter of the sweep, to three decimals; a whole circle has none. A curve that changed, or a
  wall that took another type, is in `marks.changed.walls`, so the picture outlines its old place.
- The data gains `types` (`list`, `type`, `name`, `status`, `fields` with `field`, `before`,
  `after`, `parts` as `{type, id}`, `text`), `finishes` (`room`, `name`, `changes` with `surface`,
  `wall`, `before`, `after`, `text`) and `curves` (`wall`, `before` and `after` as `{radius, sweep,
  bulge}` or null, `text`). No new code in the record.
