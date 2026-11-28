# WRT-88: a bay window written in one rooms text line

## Outcome

An agent writing a house rooms first writes a bay window on a room's side in one line, instead
of splitting the side and working out an arc or facets by hand:

    bay in living south, 2.4 wide, 0.9 deep, curved, windows 3
    bay in living south, 1.2 from west, 2.4 wide, 0.9 deep, canted, windows 3

- The room's side facing that way gets a bay: `curved`, an arc of that width (its chord) bowing
  that deep out of the room; `canted`, a front facet and two cheeks at 45 degrees to the side
  (or `canted <deg>`). Width and depth measure to the room's inside faces, as a room's outline
  does. Centred on the side unless the line says `<m> from <end>` (to the bay's near edge, the
  way an opening's place is measured).
- The bay's walls are worked out as any other walls of the room: outside walls of the floor's
  outside thickness and kind, a curved bay one curved wall (C21's `arc`), a canted bay three
  straight walls.
- `windows <n> [<w> wide]` puts windows in the bay: on a canted bay one per facet (3) or the
  front one alone (1); on a curved bay n windows spread evenly along the curve. Without a width,
  each window fills its facet, or its share of the curve, less a pier at each end. The windows
  take the plan's window sill and height like any other window and are named
  `<room>-bay-1`, `-2`, ... (a second bay on the same room `<room>-bay2-1`, ...). Without
  `windows` the bay has none.
- A bay that cannot be built is refused with the reason and the fix: no such room, no or more
  than one straight side facing that way, a bay wider than the stretch of side it sits on, a
  curved bay deeper than half its width (more than a half circle), a canted bay too shallow-
  angled or too deep for its width to leave a front facet, a window count a canted bay cannot
  take, windows that do not fit.
- The read-back gives the bay line back while the text still writes the plan (WRT-87's kept
  text), and a plan read back without its text still writes the same plan again.

## Design

- `packages/floorplan/src/rooms/bayWindows.ts` (new): reading the line's words and the bay's
  geometry (the outline with the bay put into one side, the circle a curved bay lies on, the
  facets of a canted one and the windows' places), pure, points in and points out.
- `packages/floorplan/src/rooms/curves.ts`: exports the arc through two points (the existing
  private helpers), so a curved bay is traced at the same fixed stations as every curve.
- `packages/floorplan/src/rooms/compile.ts`: a `bay in ...` line (a parking bay line never has
  `in` after `bay`) changes the room's outline at once, as `wall <room> <side> curve radius`
  does, and adds its windows to the floor's openings with an aim: the facet they sit on, or the
  direction from the curve's centre to their middle. `resolveOpening` uses that aim in place of
  the side word, so the window's sill, height, kind and fit checks are the ones every window
  has. The language in the header gains the line.
- Two new figures in the tolerance table (`geometry/tolerances.ts`, `docs/tolerances.md`): the
  cheek angle of a canted bay that states none (45 degrees) and the pier left at each end of a
  bay window that states no width (0.1 m).
- Every sentence in `messages/en.ts` (with its draft in `es.ts`). No new message code: a refusal
  is `rooms/syntax`, `rooms/no-side`, `rooms/size` or `rooms/unknown-room`, as for a curved side.
- `docs/rooms-first.md` gains the line; `changes/WRT-88.md` its fragment.
- Decisions: the bay's walls take the floor's outside wall rule (no `walls` words on the line,
  `wall <room> <side>` lines still apply to the room's straight sides); a bay inside a `unit`
  is not handled specially; no new convention in `types/floorplan.ts`.

## Done

- `packages/floorplan/src/rooms/__tests__/bayWindows.test.ts`: a curved and a canted bay give
  the outline, the walls (one curved wall of the right radius and sweep, or three straight
  ones), the windows on their facets or spread along the curve, each refusal, and the read-back
  with and without the kept text.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan/src/rooms`,
  `packages/floorplan/src/__tests__`, `packages/floorplan/src/geometry` (the tolerance table),
  `packages/floorplan/src/messages`, `packages/cli/src/__tests__`, `packages/cli/src/mcp` and
  `packages/cli/src/command`, and `npm run scoreboard`, which must not get worse.
