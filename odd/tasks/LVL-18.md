# LVL-18: a storey under 2 m and a stair door under 1.8 m are questioned

## Outcome

A storey too low for a person to stand in is asked about. A floor that states a height lower than
2 m is questioned (`floor/size-question`), and so is, in a plan of more than one floor, a floor
that states none and whose tallest wall is lower than 2 m: that wall sets the storey. A floor under
a roof of its own keeps the old lower bound, since a loft's eaves are often that low. A door or a
doorless opening onto a room used as a stair or a lift that is lower than 1.8 m is questioned too
(`opening/size-question`), naming the stair or lift. Both figures are Grid's own drawing figures in
the tolerances table and cite no document; both are warnings worded as questions.

When an opening reaches above its walls, the refusal and the fix no longer lead with lowering the
opening: rooms text's refusal (`rooms/opening-too-high`) and the plan check's fix
(`opening/too-tall`) first say to raise the walls, or the floor's height and the elevation of a
floor over it, if the storey is taller, and only then to lower the opening. Where the walls are
lower than 2 m, the refusal says so. So an agent that stacks half-levels 1.2 m high with 2.1 m doors
is told its storeys are low, not to lower its doors to 1.15 m.

## Design

- `packages/floorplan/src/geometry/tolerances.ts`: two new limits in the plausibility block,
  `storeyLowest` (2 m) and `stairDoorLowest` (1.8 m), Grid's own; their rows in `docs/tolerances.md`.
- `packages/floorplan/src/geometry/levels.ts`: `floorHeightQuestions` asks about a stated height
  lower than `storeyLowest`; a floor with a roof keeps `wallLowest`.
- `packages/floorplan/src/geometry/plausible.ts`: in a plan of two floors or more, a floor that
  states no height, has no roof and whose tallest solid wall (fences, parapets round outdoor space
  and garden walls left out, as the storey's height leaves them out) is lower than `storeyLowest`
  gets `floor/size-question`, worded from its walls. A door or doorless opening on a wall of a room
  used as a stair or a lift, lower than `stairDoorLowest`, gets `opening/size-question`.
- `packages/floorplan/src/rooms/compile.ts`: the rooms line refusal moves into the message files
  (it was an English sentence in the code) and both the rooms line and the raw room refusal say to
  raise first; under `storeyLowest` they say the walls are lower than a storey.
- `packages/floorplan/src/messages/en.ts`, `es.ts`: the new sentences, the reworded fixes of
  `opening/too-tall`, and `line.floor/size-question.says`, which now reads "has a height" since a
  floor's height may come from its walls; its row in `docs/result-contract.md`.
- `docs/plan-file.md`: the floor heights paragraph says what is asked.

Decisions taken alone:
- The change id is LVL-18: LVL-17 was already used on main by the door between two levels.
- The derived storey is asked about only with two floors or more: a one-floor plan of low walls is
  as likely a garden, a model or a fence plan, and its walls already have their own questions.
- A roof floor keeps the old lower bound (a loft may state a low eaves height).
- A doorless opening counts with doors; windows do not. An opening already asked about as lower
  than `openingLowest` is not asked twice.
- For a storey of an ordinary height the refusal still offers lowering the opening, after raising.

## Done

- `geometry/__tests__/lowStorey.test.ts`: a floor stating 1.2 m is asked about; one stating 2.4 m
  is not; a roof floor stating 1.2 m is not; in a two-floor plan a floor of 1.2 m walls with no
  stated height is asked about, a one-floor plan of them is not; a 1.15 m door onto a stair and a
  1.6 m door onto a lift are asked about, a 2.1 m one is not, nor a 1.15 m door between two rooms.
- `rooms/__tests__/`: the refusal for a 2.1 m door on 1.2 m walls says the walls are lower than a
  storey and to raise them before lowering the door; on 2.4 m walls it says to raise first too.
- The `opening/too-tall` fix test in the CLI reads the new words.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and CLI tests touched, `ownWords` and
  the tolerances tests, `npm run scoreboard` no worse.
