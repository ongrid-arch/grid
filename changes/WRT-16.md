# 2026-11-25: grid write no longer drops floors the rooms text does not mention (WRT-16)

## For people

- Writing rooms text for one floor into a plan that has more floors used to delete the others,
  with their outlines, homes and parking, and answer that nothing was wrong. `grid write` now
  refuses, naming each floor it would drop and what stands on it, and writes nothing. Read the
  whole plan back with `grid describe --as rooms`, change that and write it; or add `--replace`
  to drop the floors, and the answer lists them (WRT-16).
- Rooms text with no rooms is refused, even with `--replace`, instead of writing an empty plan
  (WRT-16).

## For agents

- `grid_write_rooms` refuses rooms text whose floors leave out a floor the plan file holds, in one
  line naming each floor with its rooms, outline, homes and parking; nothing is written.
  `replace=true` drops them and the answer's lines say "Floors dropped, as asked: ...". Rooms text
  with no rooms is refused with and without `replace`. No new code in the record.
