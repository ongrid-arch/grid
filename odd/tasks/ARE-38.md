# ARE-38: count a numbered room wish by its name stem, and list the rooms counted

## Outcome

A brief wish for "3 consult rooms" by name finds "Consult 1", "Consult 2" and "Consult 3" as
well as a room named exactly "Consult", and the answer lists the rooms it counted by name, so a
person can see why the count is what it is and which room is left out (such as "Cat consult",
which the stem does not name).

## Design

- `packages/cli/src/brief/lines.ts`: `roomsNamed` matches a name exactly (any case), or the name
  followed by a number or a single letter ("Consult 1", "Consult-2", "Consult #3", "Consult A",
  "Consult2"). A name that only contains the stem inside it ("Cat consult") is not matched: it
  could be a different room, and the list of rooms counted shows it was left out. Only when
  nothing matches by name does the id match apply, as before. The same match serves touch and
  figure wishes, so every wish by name reads a name the same way.
- A count line (and a named or used room line) says which rooms it counted: `drawn 2 (Consult 1, Consult 2)`,
  at most 12 names and then "and n more".
- No new convention and no new message code.

## Done

- A test: a brief for 3 consult rooms on a plan with Consult 1, Consult 2, Consult 3 and Cat
  consult counts 3 by name, lists the three, and does not count Cat consult.
- A test: an exact name still counts exactly, and an id still matches when no name does.
- `docs/brief.md` says it; `changes/ARE-38.md`.
- typecheck, lint, `packages/cli` tests, ownWords and tolerances tests, scoreboard.
