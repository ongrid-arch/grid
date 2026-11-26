# CMD-41: plan revisions, so no change is lost to another one

## Outcome

An agent, or several agents and processes at once, can change a plan without a change being
silently lost. Today a change reads the plan, works out the change and writes the file back; two
processes doing that at the same time each write their own reading, and the later one wipes the
earlier one out while both answer "Wrote". After this change:

- Every answer of `grid serve` about a plan carries the plan's revision: `planRevision` in its
  data, and one short line of text after the answer (a text block of its own, so an answer whose
  text is CSV or rooms text is left as it is). The revision is a fingerprint of the plan file as
  it is on disk, so any writer's change, Grid's or not, gives a new one.
- Every tool that changes the plan takes `based_on`: the revision the agent read. When the plan
  is no longer at that revision the change is refused, nothing is written, and the refusal says
  "the plan changed since you read it", the revision it is at now, and what changed (the
  building comparison `grid_diff` uses, `compareBuildings`) when the server still holds the
  version that was read.
- Changes to one plan never run over each other, in one process or in several: a change holds a
  lock on the plan file, across processes, from reading the plan to writing it back. A second
  change waits for the first and then works on the plan as the first left it. This also holds
  for `grid edit`, which runs the same edits without the server.

## Design

- `packages/cli/src/edit/revision.ts` (new): `planRevisionOf(project, file)`, the first 12 hex
  digits of the SHA-256 of the plan file's text, or null when there is none; it keeps the last
  few texts it read in memory, by revision, so a refusal can say what changed since. The lock:
  `withPlanLock` (waits by blocking, for `grid edit` and the edit path) and `withPlanLockAsync`
  (waits without blocking the server's loop), one lock file beside the plan (`<plan>.lock`,
  holding the process id and the time) made with the project's exclusive create, and removed
  after. A lock whose process is gone, or older than ten minutes, is taken over. Within one
  process the lock is re-entrant, so the server's hold and the edit path's hold are one.
- `packages/cli/src/fs/projectFiles.ts`: one small method, `removeFile`, to take the lock file
  away (nothing else in the package may touch the disk). Outside this change's area, kept small.
- `packages/cli/src/mcp/revisions.ts` (new): the `based_on` argument, added by `allArgs` in
  `toolkit.ts` to every tool whose hint is `change-plan` (beside `whole` and `page`), and
  `guardedRun`, which `serveTools.ts`'s `answer` runs every tool through. So every tool, and every
  tool added later, gets the revision and the check without a line of its own. For a change it
  queues calls to the same plan in the process, takes the lock, checks `based_on`, runs the tool
  and reads the revision it wrote; for a read it reads the revision before the tool reads the
  plan, so a revision never claims more than the answer saw.
- `writeChange` in `writeTools.ts`, the edit path every room, opening and wall change goes
  through, takes the lock itself too, so `grid edit` (which calls the tools without the server)
  is covered. The words tool, which writes the plan's display, takes it around its own write.
- `labelledSchema` in `toolkit.ts` lists `planRevision` in every output schema; it is not
  required, since a call about a plan that is not there has none. The preview tools keep their
  own `revision`, which is the page's and a different thing.
- `protocol.ts`: a `ToolAnswer` may carry a `footnote`, sent as a last text block after the
  pictures.
- Grid's words for the line and the refusals go in `messages/en.ts` (`tool.revision.*`) with
  their draft Spanish.
- Decided: no `based_on` on `grid edit` on the command line; the lock covers it, and a person at
  a terminal reads the plan as it is. `grid write` and `grid tidy` on the command line are not
  locked here (their commands are outside this change's area); through the server they are.
- Decided: the version read is held in memory only, so a refusal after a server restart, or for
  a revision read from another process, says what changed can't be listed and how to read the
  plan again, rather than keeping copies of the plan beside it.

## Done

- `packages/cli/src/edit/__tests__/revision.test.ts`: the revision changes with any change to the
  file and not otherwise; the lock is exclusive, re-entrant, waits for a holder, takes over a
  lock whose process is gone, and is removed after.
- `packages/cli/src/mcp/__tests__/revisions.test.ts`: every answer carries `planRevision` and
  its line; a change answers the new revision; `based_on` at the plan's revision writes, a stale
  one is refused with "changed since you read it", the new revision and what changed, and nothing
  is written; every change tool lists `based_on` and no reading tool does; a change made while
  another process holds the lock waits for it and keeps the other process's change.
- `packages/cli/src/mcp/__tests__/parallelChanges.test.ts`: several server processes renaming
  rooms of one plan at the same time all answer "Wrote" and every rename is in the file.
- `tools.test.ts`, `outputSchemas.test.ts`, the cli package's tests, `ownWords.test.ts`, lint,
  the type check and the scoreboard.
