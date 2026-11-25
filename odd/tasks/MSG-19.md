# MSG-19: read every seen mark Grid writes

## Outcome

A note on any kind of part Grid reports on, a flat or an opening pattern included, can be set
aside as seen, and the mark is read back by `grid check`, `grid_check` and `grid_mark_seen`.
One mark that cannot be read never makes the others unreadable: they still count as seen, and
the check says how many marks it could not read. Grid says "Marked" only when the mark it just
wrote can be read back from the file.

## Design

- `packages/cli/src/seen/marks.ts`: the kinds a mark may name come from the one list of kinds a
  note's thing can have (`ThingKind` in `@ongrid/rules`), so `flat` and `pattern` are read.
  The list is typed so a kind added to `ThingKind` fails the type check until it is read here.
- `parseSeenLoose(raw)` checks the file's frame strictly (object, version, list) and each mark
  on its own; a mark that is wrong is left out and counted. `readSeen` uses it: the readable
  marks are kept, and `problem` says how many were left out and the first reason, without
  quoting text. `parseSeen` keeps its strict behaviour.
- `markSeen` still refuses to write over a file with marks it could not read (writing would
  delete them). After writing, it reads the file back and refuses to say Marked when the new
  mark is not among the marks read.
- Decision: a file with unreadable marks is no longer refused whole, so notes keep their
  state; marking a new note is still refused until the bad mark is corrected, to protect it.

## Done

- `packages/cli/src/seen/__tests__/marks.test.ts`: a mark on a flat and on a pattern is
  written and read back; a file with one bad mark among good ones reads the good ones and
  reports one left out; marking is refused over such a file.
- `shortReport.test.ts` and `planFile.test.ts` still pass.
- typecheck, lint, the cli package tests, the scoreboard.
