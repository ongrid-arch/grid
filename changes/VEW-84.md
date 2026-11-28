# 2026-11-28: level marks at the building, on a datum line, staggered (VEW-84)

## For people

- A section's and an elevation's level marks stand just beside the building, however far the
  section line runs past it, each on a thin datum line back to what it marks, and levels close
  together are staggered instead of printed over each other (VEW-84).
- A split level's halves are each marked beside their own half (VEW-84).
- An elevation marks the ground, a sloped roof's eaves and ridge, a flat roof's top and a
  parapet's top as well as each floor; a section also marks the top of a parapet it cuts (VEW-84).

## For agents

- `planSection` gives `building` (`{from, to}` across the section, or null), each level's `from`
  and `to` (where its floor is cut) and each roof's `from`, `to` and `parapet` (the top of a parapet
  cut on it). `planFacade` gives `marks`: `{kind, floor, level, u0, u1}` with `kind` `ground`,
  `floor`, `eaves`, `ridge`, `roof` or `parapet`, lowest first; `levels` is unchanged.
- In the pictures, every level mark is a group with `data-level` and a `level-datum` path; the
  words' backing is `level-backing` (was `section-level-backing`), stepped words have a
  `level-leader`. A section adds `section-parapet-level`; an elevation's floor marks stay
  `facade-level` (their words are no longer a `facade-level-name` group) and add
  `facade-ground-level`, `facade-eaves-level`, `facade-ridge-level`, `facade-roof-level` and
  `facade-parapet-level`. No new code in the record.
