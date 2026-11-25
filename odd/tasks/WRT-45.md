# WRT-45: door and window lines that name a raw room

## Outcome

A door, window or opening line in rooms text may name a room written raw (`raw room {...}`),
in `between <room> and <room>` or `in <room> <side>`. When the line says plainly which of the
room's walls it means, Grid places the opening on that wall, as it places one between rooms it
worked out itself. When it cannot tell, the line is refused by name: the room is written raw,
why the wall cannot be found, the room's walls, and the raw opening line to write instead, with
the wall and the offset filled in when Grid knows them. No opening line is ever passed over in
silence: a floor whose rooms are all raw used to drop every door and window on it ("0 openings
placed"), and a line naming a raw room beside rooms Grid worked out was refused as naming no
room at all.

## Design

All in the opening-line code of `packages/floorplan/src/rooms/compile.ts`, with its words in
`messages/en.ts` and `messages/es.ts`.

- The words after the place (`centred`, `<m> from <side>`, `wide`, `sill`, `height`, `opens`,
  `hinged`, a kind, `part`) are read by one function, used by both kinds of line, so the two
  read them the same.
- An opening line that names a raw room on its floor is set aside while the floor's walls are
  worked out and placed once every wall of the plan, raw ones too, is known: the plan as
  written so far is read with `safeParseFloorPlan`, and the room's walls and outline come from
  the core (`indexPlan`, `tryRoomPolygon`, `wallLength`, `wallFrameAt`), never worked out here.
- Which wall: `between A and B` is the one wall in both rooms' boundaries; `in A <side>` is the
  one wall of A whose outside face looks that way (within 45 degrees), the outside face being
  the one away from the room's outline.
- Where along it: `centred`, or `<m> from <north|south|east|west>` measured from the wall's end
  that lies that way, along the wall (its arc for a curved wall). `of <room>` is not taken: a
  raw room's sides are its walls.
- A door's swing and hinge are worked out as for any door line: the room it opens into is found
  on one face of the wall by stepping past that face into the room's outline.
- Refused by name, with the codes rooms text already uses (`rooms/no-shared-wall`,
  `rooms/two-shared-walls`, `rooms/no-side`, `rooms/unknown-room`, `rooms/opening-fit`): no
  wall in common, more than one, no wall or several facing the side, `of <room>`, a room that
  cannot be drawn. Each says the raw opening line to write. No message code is new, so the
  result contract's catalogue is untouched.
- A floor with no worked-out rooms now reads its opening lines too, and refuses a line that
  names no room on it.

## Done

- `packages/floorplan/src/rooms/__tests__/rawRoomOpenings.test.ts`: a door between two raw
  rooms, a window in a raw room's side, a door between a raw and a worked-out room through a
  shared wall, a curved wall, swing and hinge, and every refusal with its suggested raw line;
  a floor of raw rooms whose lines used to be dropped. They fail before the change.
- `npx vitest run packages/floorplan`, `packages/cli/src/__tests__/ownWords.test.ts`,
  `packages/floorplan/src/geometry/__tests__/tolerances.test.ts`, `npm run typecheck`,
  `npm run lint`, `npm run scoreboard`.
