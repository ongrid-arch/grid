# WRT-57: an entrance door stays leading outside when a room is carved beside it

## Outcome

- A room carved in the corner of another (`inside hall corner nw`), beside the door that leads
  outside, splits that side of the room in two: the wall to the new room and a short piece of
  outside wall. The door line written `in hall north` is refused, as WRT-51 refuses it, but the
  refusal no longer offers, on its own, the line that puts the door in the wall to the new room.
  A door or doorless opening written in a side of which a part is onto the outside is never
  offered only lines that lead it into a room: when no line onto the outside holds it, the
  refusal offers none and says so, and that a door in the wall to the room would lead into that
  room, not outside. Where both hold it, both are offered, as WRT-51 offers them.
- `grid write` and `grid_write_rooms` over an existing plan name each door that joins other
  rooms than it joined before, from where it stands, as the edit tools already do; a door that
  led outside and no longer does is said first and in so many words.
- The write's answer counts what `grid check` will list, route findings and all, beside the
  drawing problems: "To look at: 0 → 2, of them problems in the drawing 0 → 0". So a write that
  leaves the floor with no door to the outside is never answered "problems 0 → 0" alone.

## Design

- `packages/floorplan/src/rooms/compile.ts`, the WRT-51 offers only: `pickEdge` marks the offers
  of a `door` or `opening` line when one of the sides it chose between is onto the outside
  (`leadsOut`); when every such offer that writes places it in a wall to a room, `withSideFix`
  keeps none of them and adds one sentence naming the rooms and the side's word. No placement changes, no
  new code (the refusal stays `rooms/no-side`).
- `packages/cli/src/command/write.ts`: after the write, `doorsThatChangedRooms` (MSG-14, the
  edits' own check) between the plan before and the plan as written, and `inspectPlan`'s count
  of the file before and after, as `writeTools.ts` counts an edit. The answer's lines and the
  data `doors` and `toLookAt` (null for a scan, which keeps its own answer) in `grid_write_rooms`.
- The words in `packages/floorplan/src/messages/en.ts` and the draft `es.ts`.
- Decisions: the line into the room's wall is not offered alone, rather than offered with a
  warning, since an agent takes an offered line as written; offered beside a line onto the
  outside it stays, as the choice is then plain (WRT-51's WC beside an outside wall); a writer who means that room still
  writes the side by its word or `between`. A door that stops leading outside is named in the
  answer, not refused: the person may mean it (a store that becomes the porch), and the count and
  `grid check` say what it costs. `drawingProblems` stays as it was, for readers of the data.

## Done

- `packages/floorplan/src/rooms/__tests__/carvedEntrance.test.ts`: the sample flat with a store
  carved in the hall's corner beside its entrance offers no line into the store and says why;
  with room for the door beside the store, the one line offered leads outside and writes.
- `packages/cli/src/command/__tests__/writeEntrance.test.ts`: writing the flat with the door put
  in the store's wall names the door that no longer leads outside and counts the route findings
  ("To look at: 0 → 2"), on the command and on `grid_write_rooms`.
- Both fail before the change. Then `npx vitest run packages/floorplan`, `packages/cli`,
  `ownWords.test.ts`, `tolerances.test.ts`, typecheck, lint, scoreboard.
