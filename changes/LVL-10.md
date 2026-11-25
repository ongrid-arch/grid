# 2026-11-25: a part floor is said as a set-back, not as a floor out of line (LVL-10)

## For people

- A floor that lies wholly inside the floor below it, such as a mezzanine, a part upper floor,
  the floor over a single-storey extension or a ground floor over a larger basement, is no longer
  said to be out of line. `grid check` says it once as a part floor: the sides it sits back on and
  how far on each, the sides it lines up with, and where it and the floor below stand. A floor set
  back on one side only is no longer said to sit back "all round", nor by the width of the strip
  in place of how far it sits back (LVL-10).

## For agents

- New code `floor/set-back` (`worth-a-look`, on the floor): a floor wholly inside the floors one
  level below, with nothing reaching past them. Its message names each side it sits back on
  (north, east, south, west) and by how much, the sides it lines up with, its box and the box of
  the floor below, and ends with the same fix as `floor/out-of-line`. Such a floor no longer gets
  `floor/out-of-line`. Neither is given for a floor marked `overhang: "meant"`.
- `floor/out-of-line` calls a stretch "all round" only when it goes round the floor; a strip
  along one side is named by its side and how far it reaches toward it.

## Codes

| `floor/set-back` | {thing} is a part floor, set back from the floor below it | a floor's outline over the floor below it, or marked overhang "meant" where it is a part floor on purpose |
