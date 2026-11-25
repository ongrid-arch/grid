# 2026-11-25: an opening becomes a handed door in one call (WRT-54)

## For people

- Turning a doorless opening into a door and saying which way it opens and which side it hangs
  on now takes one request, not three (WRT-54).

## For agents

- `grid_change_opening` with `type: "door"` and `opens_into` or `hinged` applies the type first,
  so the handing is no longer refused with "Only a door has a handing". Its refusals say "an
  opening". No new code in the record.
