# WRT-73: mark the plan as it stands as the existing state

## Outcome

An agent starting a renovation, an extension or a demolition never hand-edits JSON to give
parts a phase:

- `grid_start_works` tags every wall, door, window and room of the plan as it stands `existing`,
  so every later edit is the work (what it adds is new, what it takes out is kept to be
  demolished). A plan already tagged is left as it is and the answer says so.
- `grid_set_phase` marks parts `existing`, `demolished` or `new`, by id or by room. A room
  takes its own walls with it, never a wall another room still needs, and the doors and windows
  in them.
- `grid_phase_from` writes one phased plan from two plans, the building before and after:
  what only the first holds is `demolished`, what only the second holds is `new`, what both hold
  the same is `existing`, and a part both hold but changed is its old self (`<id>-before`,
  demolished) beside its new self.
- A correction fixes the survey without making work: `correction: true` on an edit applies it
  in place and leaves every phase as it was ("the hall is on the right, actually" is a fix of
  the drawing, not building work). `grid_mirror` takes `keep_north: true` for "I drew it the
  wrong way round": the building is mirrored and the stated north stays where it was.
- The phase rules are in the descriptions of the tools that write and edit a plan.
- `grid edit phase`, `start-works` and `phase-from` run the same tools from the command line.

## Design

- `packages/cli/src/edit/phaseMarks.ts` (new, self-contained): `startWorks` and `setPhase` turn a
  survey into a `Patch` that sets `phase` on walls, openings and rooms (the patch already carries
  the field), and `phasedPlanFrom` works two raw plan files into one raw plan with phases.
  Nothing here touches `phasedPatch`, the room edits or the rooms-text compiler.
- `packages/cli/src/mcp/phaseTools.ts` (new): the three tools. The two that change one plan go
  through `writeChange`, so they are refused when they would break the drawing, say what they
  changed and write only that change. `grid_phase_from` reads two plans and writes a third.
- `writeChange` skips `phasedPatch` when the call says `correction`; the argument (`CORRECTION_ARG`)
  is on every edit that would otherwise make work: change wall, change opening, move side, mirror,
  stretch, merge, split, add room, add opening and square scan (a survey is also fixed by adding
  what it missed). Edits are worked out on the building after the work, so a mirror or turn given
  `correction` is worked out on the whole plan, and any other correction of a plan with walls to
  be demolished says that it left them.
- `mirrorPlan` takes `keepNorth`, which leaves `north` out of what it writes and says so.
- A part set to the phase it has is not counted as changed. A wall set to `demolished` or `new`
  takes with it the doors and windows on it that state a phase of their own, so no door stands
  when its wall does not; set to `existing` by id, it leaves theirs.
- Start works leaves a door or window with no phase on a demolished or new wall unmarked, so it
  goes on following its wall.
- Phase from two plans refuses to write over either of them.
- Decision: the rooms-text compiler stays as it is (out of this card's area), so the "rooms-text
  form" is `grid_start_works` run on the written plan, not a new line of the language.

## Done

- `mcp/__tests__/phaseTools.test.ts`: start works tags every part and nothing twice; set phase by
  id and by room (shared walls kept, doors follow); phase from two plans (existing, demolished,
  new, changed) reads back as the two plans; a correction leaves phases alone while the same edit
  without it makes work; mirror keeps north.
- Tool list tests (order, count) and the tool server's page updated; `grid edit` verbs work.
- `npm run typecheck`, `npm run lint`, the cli and floorplan test folders, `ownWords` and
  `contract`, and `npm run scoreboard` hold.
