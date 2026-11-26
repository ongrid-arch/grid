# 2026-11-26: a floor line's refusal names its real fault (WRT-69)

## For people

- Rooms text says what is wrong with a floor line. `floor g 0` says the 0 stands where the
  floor's name goes, that a name is written in quotes, and offers `floor g level 0`; a quoted name
  written after the settings is offered back right after the id; and `slab` with nothing after it
  says it takes `slab <m>`, the thickness of the floor it stands on. A walls, doors or windows line
  that ends on one of its own words says that word needs its value, where it said the word was
  not understood, and `slab` on a walls line says it is written on the floor line (WRT-69).

## For agents

- `grid_write_rooms` and `grid write`: the `rooms/syntax` refusals of a floor line have new words. A
  number right after the id: "'0' stands where the floor's name goes, right after its id…", with
  "Write it: 'floor g level 0'" when the number can be a storey number and the line has no level.
  A quoted name after the settings: "The floor's name "Ground" is written right after its id,
  before the settings. Write it: '…'". A word with no value: "'slab' needs its value after it:
  slab <m>, the thickness of the floor it stands on, as 'slab 0.25'" (each floor word says its
  own). On a walls, doors or windows line, a known last word is "'height' needs its value after
  it. Known words: …" and `slab`, `elevation` or `level` is "'slab' is written on the floor line,
  not here: floor <id> slab <m>". Lines that were read before are read the same. No new code in
  the record.
