# 2026-11-25: open-air rooms and voids get no height in section labels (VEW-56)

## For people

- A section names an unroofed outdoor space or a void without a height: an open pitch no longer reads "8.00 m". A room too thin for two lines, such as a canopy, is labelled with its name rather than its height.

## For agents

- `grid_section` and the section picture: a room of the section with `open: true` (a void, or an outdoor space with no roof) is drawn with its name and no height, and is left out of the note on heights taken from the storey. A single-line label is the room's name when it fits, else its height.
- No new code in the record.
