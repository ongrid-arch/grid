# WRT-68: a raw line of a kind raw does not take names that kind

## Outcome

- A `raw` line whose kind raw does not take, such as `raw stair {"id": "s1", "from": "ground",
  "to": "first", ...}`, is refused as `rooms/raw` on its line, naming `raw stair`, the kinds raw
  takes (wall, room, opening or floor) and where a stair goes. It never says that `raw` is not a
  word rooms text knows while listing `raw` among the words it does.
- The same holds when `raw` is written with capitals (`Raw stair`, `RAW STAIR`): the line is read
  as a raw line and refused for its kind. A kind raw does take, written with capitals (`Raw wall
  {...}`, `raw Wall {...}`), is refused with the line written in small letters (`raw wall`), as
  every other word that starts a line is read in small letters only.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `run()`: the test for a raw line matches `raw` in
  any letter case. A line whose `raw` and kind are a kind raw takes but not in small letters is
  refused by a new wording, `rooms.raw.smallLetters`, offering the small-letter line; any other
  kind goes to `rawKind`, as before (WRT-48), which already names the kind and the kinds raw
  takes. The part is not read then, so no part is written from a line that was refused.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: the new wording, in both languages.
- Decisions: capitals are refused, never read as raw, because every other word that starts a
  line (`room`, `wall`) is read in small letters only; reading `Raw wall` alone would make raw
  the one exception. The message code stays `rooms/raw`, so no new code. The refused line keeps
  the code it had for an unknown kind; only the wording and the code for capitals change
  (`rooms/syntax` to `rooms/raw`).

## Done

- `packages/floorplan/src/rooms/__tests__/rawInput.test.ts`: the sample plans' stair line is
  refused naming `raw stair`, the kinds raw takes and `"stairs"`, on its line and as `rooms/raw`,
  without "A line starts with one of"; `Raw stair` and `RAW STAIR` the same; `Raw wall {...}`
  and `raw Wall {...}` refused offering `raw wall`. The capitals cases fail before the change.
- `tsc --noEmit -p packages/floorplan`, lint, `npx vitest run packages/floorplan`,
  `ownWords.test.ts` and `tolerances.test.ts`.
