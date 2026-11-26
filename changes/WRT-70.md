# 2026-11-26: a part typed by the plan's default types stays typed by them when written again from rooms text (WRT-70)

## For people

- A plan whose walls, doors or windows take their type from the plan's default types can be read
  back as rooms text (`grid describe --as rooms`) and written again (`grid write`) without every
  part gaining that type as its own. The file names a type only on the parts that named one, and
  leaves to the default type what it gives, so a later change of the default still reaches every
  part it types. It used to name the default on every wall and window, so changing the default
  no longer reached them (WRT-70).

## For agents

- `grid_describe` with `as: "rooms"` writes `wallType`, `doorType` or `windowType` in a `raw` line
  only when the part names it in the file. `grid_write_rooms` and `grid write` keep by id only the
  types a part named, and leave out of the file a part's type and the values it gives when they
  come from `types.defaults`; the "kept" count no longer counts those parts. No new code in the
  record.
