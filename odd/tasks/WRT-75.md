# WRT-75: write a fit-out on a base plan, in rooms text and through the tools

## Outcome

The plan file has held a fit-out on a base plan since CNT-10 (`base`, C16): the base's walls
and openings are read in as existing and stay read-only, and the fit-out's rooms may rest on
them. Until now nothing wrote one: rooms text had no word for a base, `grid write` refused to
write over a fit-out, and no tool started one. When this is done:

- Rooms text takes `base <plan file>` (the path from the project folder, quoted when it holds a
  space). The rooms are written as always, by their inside faces. Every wall Grid works out
  whose room faces lie flush on a wall of the base (a wall of the same floor, along the same
  line, with each room's face on the base wall's face on that side) is not written: the room
  rests on the base's wall, which its boundary names by the base's id. A wall Grid works out
  that meets such a wall has its end on the base wall's centre line, as it would on its own.
- A door or window the text places in a wall that rests on the base is refused, naming the base
  wall: the shell is read-only, and its openings are the base's. A room face that stands near a
  base wall but not on it is said, with how far off it is, so the agent can place it on it.
- `grid write` and `grid_write_rooms` read the base the text names through the project's one
  resolver (inside the project folder, never the plan itself, never a base that names a base of
  its own), write `base` into the plan with only the fit-out's own walls, rooms and openings,
  and say which base walls the rooms rest on. Writing rooms text again over a fit-out on the
  same base is the ordinary rewrite (the `based on` revision, `--replace`); a text that names
  another base, or none, over a fit-out is refused unless `--replace` is given.
- `grid describe --as rooms` (and `grid_describe as=rooms`) reads a fit-out back with its `base`
  line and its own rooms, doors and windows, and writing that text again gives back the same
  fit-out.
- `grid_start_fit_out` starts a fit-out from a base plan: it writes a new plan file that names
  the base and has the base's rooms, as they stand after its own work, as its own rooms on the
  base's walls (same ids and names), so the agent can then split, merge and add rooms with the
  edit tools, which already keep the base read-only.

## Design

- `packages/floorplan/src/rooms/base.ts` (new): the `base` line (`BASE_LINE_WORDS`,
  `baseNamedIn`, which the command reads before compiling, since the compiler reads no file),
  and `restOnBase(plan, base)`: the pure step that takes the written plan and the base plan and
  puts the base's walls in place of the walls that lie on them, moves the ends of the walls
  that met them, keeps the openings on those walls where they stood and refuses openings in the
  shell. The match is by faces, not centre lines, so a room written by its inside faces rests on
  a base wall of any thickness. Tolerances: `flushFaces` for a face on a face, `writtenParallel`
  for the direction, `joint` for an end on a line, all from the table. A raw wall with a base
  wall's id that stands where the base wall stands is the base's own (the read-back writes a
  floor it gives raw that way) and is dropped too. `fitOutReading` gives the read-back the plan
  it reads (the fit-out with the base walls its rooms name, no base openings) and the same view
  of a plan written again, so the two compare part by part.
- Hooks, one or two lines each: the compiler's statement dispatch reads the `base` line; its
  `CompileOptions` take `base` (the file named and the plan read); `compiled()` calls
  `restOnBase` before the id check and checks the plan with its base read in (base parts are
  never refused there: they are the base's). `read.ts` takes `base` in `ReadOptions`, writes the
  `base` line in its header and compiles and compares through `fitOutReading`. `RoomsResult`
  gains `base` (the file and the walls rested on) for the answer.
- `packages/cli/src/command/plan.ts`: `readBase` split so `loadBase(project, named)` reads a base
  for `grid write` and the start tool by the same rules and words.
- `packages/cli/src/command/write.ts`: reads the base the text names, compiles with it, writes
  `base`, compares, counts and checks the fit-out with its base read in, and keys the
  rewrite checks (revision, facts carried) to the file's own parts. The CNT-10 refusal stays for
  phases rooms text cannot hold and for a base the text does not name.
- `packages/cli/src/command/describe.ts`: a fit-out is read back from its own parts with its base.
- `packages/cli/src/edit/fitOut.ts` (new) builds the started fit-out; `packages/cli/src/mcp/fitOutTool.ts`
  (new) is `grid_start_fit_out`, registered after the phase tools (49 tools).
- Words: every new sentence an answer says is a message in `en.ts` and `es.ts`; the tool's own
  description stays English, as every tool's does.
- The grammar gains a `fit-out` topic (`roomsGrammar.ts`), its example written against a small
  shell in the grammar test; `docs/rooms-first.md`, `docs/plan-file.md` and
  `docs/tool-server.md` say how to write and start one.
- No new convention: `base` is C16's. No new message code in the result record; the rooms text
  problems use the `rooms/base` code of the writer.

## Done

- `packages/floorplan/src/rooms/__tests__/base.test.ts`: a shell and a fit-out of two rooms
  written by their inside faces rest on the shell's four walls, the partition between them ends
  on the shell's centre lines and its door keeps its place; a base interior wall the rooms sit
  either side of is rested on from both faces; a door in a rested wall is refused naming the
  base wall; a room a little off a base wall is said with the distance; a text naming a base
  with none given is refused; the read-back of the fit-out has the `base` line and writes back
  to the same fit-out.
- `packages/cli/src/command/__tests__/write.fitout.test.ts`: `grid write` writes a fit-out from
  rooms text into a project (the file names `base` and holds no base wall), writes it again from
  its read-back, refuses another base without `--replace`, refuses a base outside the project
  and the plan itself as its own base.
- `packages/cli/src/mcp/__tests__/fitOutTool.test.ts`: `grid_start_fit_out` writes a fit-out of
  the base's rooms that `grid_check` reads with no new problem, refuses an existing plan without
  `replace`, and a `grid_split_room` on it afterwards adds a partition and leaves the base as it is.
- The tool list test, the grammar test, own words, tolerances (`packages/cli/src/__tests__/tolerances.test.ts`
  and the geometry's), typecheck, lint, build and the scoreboard (no count worse).
