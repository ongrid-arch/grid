# 2026-11-27: a simple look for a picture to show a person, and a large-print form (VEW-76)

## For people

- A plan picture for a buyer, a client or a family: ask for the simple look and each room is coloured by its use, labelled with its name, its width × depth and its area in metres and in feet and inches, with only the overall sizes round the outside, the title or address and the floor's total area under it, and none of the check's notes. The garden stays green (VEW-76).
- A large-print form of it draws each room's name large, with its area, and no dimensions, for someone who reads small print badly (VEW-76).

## For agents

- `grid_view kind=plan` takes `look: "simple"` and `look: "large"`. The description now says to use `simple` for a picture to show a person and keep `working` for checking the drawing. In `simple`: rooms filled by use (an outdoor room keeps its own fill), each label with the area and, for a rectangular room, width × depth, in the plan's display and then the other units in brackets, the overall dimensions only (with their unit and the other units), the plan's name or the site's name and address, and under the drawing `Floor area … (…): the floor inside each room's walls, added up (net area)` and any outdoor space apart; no fault marks or list, no door warnings, no outline of the floor above. `large`: names at twice or one and a half times the size where they fit, the area under them, no dimensions, the same band at one and a half times the size. The answer's first line says what the look shows instead of "with inside sizes", and a floor with grid_check lines says they are left off the picture. A facade or a section asked for in either look is drawn in `working` and says `working (asked as simple)`; a section asked for in `dark` now says `working (asked as dark)`, which is the look it was drawn in. `grid draw --look simple|large` draws the same. No new code in the record.
