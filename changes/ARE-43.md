# 2026-11-25: a flat entered only without a door is noted (ARE-43)

## For people

- A flat that opens onto the common stair or landing only through plain openings or open sides,
  with no door anywhere on its way in, now gets a note in `grid check`: it has no front door
  that could be shut (ARE-43). A flat with one real door, or one joined by a stair, is not noted.

## For agents

- New finding `flat/entrance-without-door`: a flat entered, from a common part, a room in no
  flat, a space not drawn or the outside, only through openings of type `opening` or open
  sides, never a door or a stair. Its thing is the flat. A flat with no way in at all still gets
  `flat/no-front-door`; the two never name the same flat.

## Codes

| `flat/entrance-without-door` | {wording} | a front door, in the opening it is entered by or elsewhere on the way in from the common parts |
