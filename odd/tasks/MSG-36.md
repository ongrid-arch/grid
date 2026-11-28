# MSG-36 · Say a repeated note once

## Outcome

A note, a warning or a refusal that is the same on many parts or many floors is said once, with
the parts or floors it holds for listed as runs of ids. Fourteen doors that hit their neighbour
are one line that ends "(the same for 14 openings: "door-101" to "door-114")"; a floor note
copied up a tower is one line "(the same on 35 floors: "l00", "l04" to "l37")"; a mistake in a
rooms text repeated on every unit or copied floor is one problem in the refusal; like changes on
many floors are one line of `grid diff`, and ids renamed by one pattern are said as that pattern.
Every id is still in the data: a grouped check line keeps them in `each` and `also`, the diff's
`changes` keep one line per change.

## Design

- `packages/floorplan/src/geometry/alike.ts`: what "alike" means, in one place. Two lines are
  alike when their words are the same once every number inside a quoted name or id is set aside
  (`alikeKey`): `"l03-door-2"` and `"l17-door-2"` read the same, `2.95 m` and `5.90 m` do not.
  `groupAlike` gathers alike items in the order they came, and keeps a group only when it holds
  at least `alikeLines` of them (a new limit in the tolerance table, 3: two floors of a house
  stay two lines). `idRuns` says a list of ids as runs (`"door-101" to "door-114"`), at most
  `alikeRunsShown` runs and then how many more. `renamePattern` finds the one change most
  renamed ids share (`"l01"` became `"l02"`).
- The check record (`packages/rules/src/result/alike.ts`, called from `record` in
  `inspect.ts` after the lines are filed under their causes): alike lines of one code, kind,
  cause, figures and firm standard become one line. Its `message` is the first line's, with the
  floors (one part per floor, or lines about floors) or the parts it holds for; `each` holds
  every part, `also` every id, `held` and `fixes` every entry. The count and the problems are
  counted after, so a copied mistake counts once. The existing grouping by room name on one floor
  (MSG-5) runs first and is kept.
- Refusals and warnings of rooms text (`problemLines` and `roomsAnswer` in
  `packages/floorplan/src/rooms/answer.ts`; `compile.ts` is not touched): alike problems are one
  line, the first, with the ids that differ in the others.
- `grid diff` (`packages/cli/src/versions/diff.ts`): the issues and the change lines are grouped
  the same way in the words; the data keeps every line. `building.ts` adds the rename pattern to
  the verdict when ids were renamed.
- Words: every sentence is a key in `messages/en.ts` and `es.ts`.

Decisions: numbers outside quotes keep lines apart, so two notes that differ in a figure are
never merged; the threshold is 3 so the common two-floor plans read as before; the diff's data
is not grouped because the scope check, the floor filter and the pictures read it line by line.

## Done

- `packages/floorplan/src/geometry/__tests__/alike.test.ts`: keys, groups, runs and patterns.
- `packages/rules/src/result/__tests__/alike.test.ts`: a five-floor tower with the same faults
  on every floor gives one line per fault, each with every part in `each`; two floors stay apart;
  lines that differ in a figure stay apart.
- `packages/floorplan/src/rooms/__tests__/alikeProblems.test.ts`: a mistake in a unit repeated
  four times is one problem in the refusal.
- `packages/cli/src/versions/__tests__`: like changes on several floors are one line of the
  diff's words, and a rename by floor is said as its pattern.
- Tolerances test, contract test, own-words test, typecheck, lint, build, scoreboard.
