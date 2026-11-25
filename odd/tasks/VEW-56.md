# VEW-56: no height for open-air rooms and voids in section labels

## Outcome

In a section, a room that has no ceiling (an outdoor space with no roof, or a room marked
`void`) is named and given no height: an open pitch no longer reads "8.00 m", which was the
height of the sky above it. A room too thin to hold a name and a height, such as a canopy, keeps
its name; the height is the part that goes.

## Design

- `packages/floorplan/src/geometry/section.ts`: `SectionRoom` gets `open?: true`, set for a
  void room or an outdoor room that `outdoorRoofed` says is open. Its worked-out height stays in
  the record (the outline and the data attribute still use it), but "heights taken from the
  storey" no longer lists it, as no height is written for it.
- `packages/viewer/src/picture/section.ts`: an open room never gets the two-line label with a
  height. A single line is the name when the name fits, and the height only when the name does not
  fit and the room has one to give. Before, a single line was always the height.
- A room with no clear place for its name (a thin one) has it written at the middle of its cut, so
  no room is left unnamed; it may then be wider than the room.
- Decision: a room with a height keeps both lines when it is tall enough, as before.
- No new convention and no new message code.

## Done

- `packages/viewer/src/picture/__tests__/sectionOpen.test.ts`: an unroofed court and a void are
  named with no height; a thin roofed canopy keeps its name; a roofed room keeps both.
- The section and picture tests, `ownWords.test.ts` and `tolerances.test.ts` pass.
