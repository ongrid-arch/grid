# CMD-51: the tool server keeps worked-out geometry between calls and stays responsive

## Outcome

An agent working on a large plan through `grid serve` gets its second and later answers about
the same version of the plan quickly, and a call with a wrong argument is refused at once.
Today every call starts afresh: the plan file is read, checked part by part and validated, and
every room outline, curved wall and survey worked out again, even when nothing changed since the
last call; a floor that is not in the plan is refused only after all of that. After this change:

- The server keeps the plan as read, with its issues and every figure the geometry layer works
  out and keeps against the plan's own parts (room outlines, traced curves, the survey), for the
  last few plan versions it read. A later call about the same version reuses them.
- Nothing stale is ever answered: a version is the plan file's own text together with every
  other file the reading looked at (a fit-out's base plan, the trace image being there). Each call
  reads them again and compares; any difference reads the plan afresh. A plan kept is frozen, so
  no call can change what another call is given.
- The plan's validation is worked out when an answer first needs it, so a call refused for its
  arguments (an unknown floor, a measure that needs a room) is refused before the geometry is
  worked out.
- A call that waits (on a plan's lock behind another change, on a picture) no longer holds up the
  answers to calls that came in after it: each answer goes out when it is ready, with its id.
- A room written as a polygon whose corners lie on one circle is answered with a note that says
  so and how to write it as a curved room instead, so its walls become one curve and not many
  short pieces.

## Design

- `packages/cli/src/mcp/planCache.ts` (new): `cachedPlan(project, file, options)`, the plan as
  `loadPlan` reads it, kept per version. The reading is done through a recording view of the
  project, which notes every file read, checked for or resolved and what came back; a version's
  key is a hash of those outcomes. On a later call the same reads are made again on the real
  project and hashed; the same hash is the same version and the plan kept is answered. At most
  `PLAN_VERSIONS_KEPT` versions are kept, the least recently used dropped first. Only a plan read
  without a refusal is kept. The plan kept is deep-frozen; its `broken` set is a set and stays one.
  Decision: the key is the content, not the file's modification time, so two writes within the
  same clock tick and a file put back as it was are both read right.
- `packages/cli/src/mcp/toolkit.ts`: `readPlan` reads through `cachedPlan`. The other direct
  `loadPlan` calls in the server are left as they are (they read once per call, rarely).
- `packages/cli/src/command/plan.ts`: `issues` and `broken` of a loaded plan are worked out when
  first read (a getter that keeps its value), so a refusal of an argument that needs only the
  plan's floors or ids comes before validation. The fields keep their types; spreading a loaded
  plan reads them as before.
- `packages/cli/src/quantities/survey.ts`: `surveyPlan` keeps its survey for a frozen plan (a
  `WeakMap` keyed by the plan object), so the survey and every figure kept against it (door
  clearances, fixtures) live as long as the version does. A plan that is not frozen may change
  and is surveyed afresh every time, as before.
- `packages/cli/src/mcp/readTools.ts`: `grid_measure` checks that the measure asked for has the
  arguments it needs before it reads the plan.
- `packages/cli/src/mcp/serve.ts`: each answer is written when it is ready instead of in the
  order the requests came in; JSON-RPC pairs answers to requests by id. Decision: true parallel
  work (worker threads) is left out: the plan locks, the cache and the preview record are kept in
  this one process, and a call that only computes still runs to its end before the next starts.
- The polygon-on-a-circle note: `packages/floorplan/src/geometry/onCircle.ts` (new) finds a room
  whose outline corners, six or more, lie on one circle within `polygon.onCircle` of the
  tolerances table; `grid_write_rooms` adds one line per such room, worded in
  `messages/en.ts` (and `es.ts`). Nothing in the rooms text compiler changes.

## Done

- `packages/cli/src/mcp/__tests__/planCache.test.ts`: a second call on the same version reuses the
  plan kept (the same object); a change to the plan file, to its base plan or to its trace
  image being there reads it afresh; a plan kept is frozen; a refusal is not kept; the oldest
  version is dropped past the limit; an unknown floor is refused without validating the plan.
- A timing check: on a plan of 42 floors, the second `grid_check` and `grid_areas` take a
  fraction of the first.
- `server.test.ts`: answers carry their ids when one call waits and a later one does not.
- The note on a polygon on a circle: given for a 12-sided room on a circle, not for a rectangle
  or an L.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, `ownWords.test.ts`.
