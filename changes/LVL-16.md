# 2026-11-25: copied and through floors keep everything they copy (LVL-16)

## For people

- A floor written with `copy <floor>` takes that floor's outline, roof, parapet, homes and
  parking too, so a tower of copied floors counts its homes and parking on every floor (LVL-16).
  A `raw floor` line on the copy sets any of them for that floor, and `null` takes one off.
- `grid write` warns when copied floors took none of the doors and windows of the floor they copy
  and wrote none of their own, naming the floors and saying to write `copy <floor> with openings`.
- A room that rises `through` floors takes the doors, windows and openings written between it and
  another rising room (a stair and its lobby) to every floor it rises through. A floor that writes
  its own opening between the two keeps its own.
- Copying a floor no longer renames the floor it copies: an id written on several floors stays as
  written on the first floor that writes it, and only the later floors take their floor's id in
  front (`first-bath`). A plan written before, with every floor's id in front, reads back as rooms
  text with its ids as they are.

## For agents

- `grid_write`'s answer has a new warning, `rooms/copy-no-openings`: the floors copied without
  `with openings` that hold no opening of their own, by the floor they copy, in one line.
- `rooms/id-changed` now says the first floor that writes an id keeps it: `'bath' is kept on floor
  'ground' and is 'first-bath' on floor 'first'`, and lists at most three other floors per id and
  ten ids, counting the rest. Ids written this way differ from before on the first floor that
  writes them (`bath`, was `ground-bath`); flats placed on several floors likewise keep their label
  on the first.
- A floor copied from another now carries `outline`, `roof`, `parapet`, `homes` and `parking` in
  the plan file, and an opening between two rooms that both rise `through` floors is on each of
  those floors, with the floor's id in front of its id.
- No new code in the record.
