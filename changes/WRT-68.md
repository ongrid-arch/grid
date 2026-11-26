# 2026-11-26: a raw line of a kind raw does not take is named, in any letter case (WRT-68)

## For people

- A `raw` line written with capitals, such as `Raw stair {...}`, is now refused for its kind,
  naming `raw stair`, the kinds raw takes and where a stair goes, never as a word rooms text does
  not know. `Raw wall {...}` is refused offering `raw wall`, as rooms text is read in small
  letters (WRT-68).

## For agents

- `grid_write_rooms` and `grid write`: a line starting `Raw` or `RAW` is answered `rooms/raw` on
  its line, no longer `rooms/syntax` "is not a word this way of writing knows". A kind raw does
  not take names that kind and the kinds raw takes (wall, room, opening or floor); a kind it does
  take written with capitals says "is read in small letters" and offers the line written in small
  letters. No new code in the record.
