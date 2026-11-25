# ARE-48: a wish to keep two rooms apart reads the ways between them

## Outcome

A brief wish that two rooms do not touch (`touch`, level `avoid`) is judged by how a person, a
sound or a smell can pass between them, not only by a shared wall. Two waiting rooms that each
open into a reception by a doorless gap are not apart: the line is missed and names the rooms
that join them, "joined through "Reception" by two open gaps". A door straight between the two
rooms joins them too. Rooms reached from each other only through a door somewhere on the way stay
apart, as every building's rooms are joined through its corridors; the met line then says so.
A wish that two rooms touch (`must`, `should`) reads as before: a shared wall.

## Design

- `packages/cli/src/brief/lines.ts`, `touchLines`: for an `avoid` wish, after the shared wall,
  read the floor's ways (`wayGraph`, the door graph of `rules/graph.ts` read only, with ARE-46's
  blocked doorways already left out) and look for the fewest rooms between any room of the first
  name and any of the second:
  - a door or gap straight between them: joined, "joined by door "d1"" / "by an open gap";
  - else a way whose every step is an open gap (a doorless opening or an open edge, a virtual
    wall): joined, with the rooms between named in order and the gaps counted;
  - else, when a way with a door exists, apart: "drawn apart, a door on every way between them".
- An open gap is any way that is not a door: an opening of type `opening`, or a virtual wall.
  A window is never a way (the graph has none).
- Only the rooms' own floor is searched: two rooms on different floors are apart.
- No new code, no convention, no tolerance. The words stay in `lines.ts` with the rest of the
  brief's lines (still `notYet` in the own-words list); its count goes up by the new sentences.

## Done

- `packages/cli/src/brief/__tests__/apart.test.ts`: a written clinic with two waiting rooms open
  to a reception is missed and names Reception and the two gaps; the same with doors is met and
  says a door is on every way; a door straight between them is missed; a `must` wish still reads
  a shared wall. Each fails before the change.
- `docs/brief.md` says how an `avoid` wish is read; `changes/ARE-48.md`.
- Type check, lint, `packages/cli` tests, own-words and tolerances tests, scoreboard.
