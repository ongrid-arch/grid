# WRT-84: a split does not copy counted facts, a merge adds them up

## Outcome

- A room split in two (`grid_split_room`, `grid edit split`, and `grid tidy`'s split along a wall
  across a room) gives the new room the facts that describe the place (a department, a cost
  centre, a status, yes-or-no facts) and none of the facts that count something (a number:
  seats, desks, a head count). The room keeps its numbers as they were, so a floor's sum of seats
  is the same after the split as before it: a 30-seat office split in two still sums to 30, not
  60.
- The split's answer names the numbers it did not copy, says the room keeps them as stated for
  the whole room, and offers the call that gives each part its own: `grid_set_facts` with the
  two rooms' ids.
- Two rooms merged add up the numbers both carry (4 seats and 6 seats are 10), and the answer
  says so, fact by fact, with the call to set another figure when the fact is not a count. A
  number only one of the rooms carries is kept, and the answer names it and which room it came
  from, so a meeting room merged into an office does not take the office's seats in silence.
- When a merge gives the merged room a use other than the first room's, the answer names the
  first room's describing facts it keeps, which may no longer fit, with the call to change them.

## Design

- `packages/floorplan/src/types/facts.ts`: `countedFacts` and `placeFacts`, a part's facts split
  by kind of value. Decision: a number is a count. Grid cannot tell a count from a measure by a
  fact's name, and a copied count is wrong without a word, while a number not copied is named
  with the call that sets it. A list of count names (seats, desks…) would miss every other
  spelling and language.
- `packages/cli/src/edit/split.ts`: the new room takes `placeFacts` only; a `guessed` line names
  the counted facts and offers `grid_set_facts`.
- `packages/cli/src/edit/merge.ts`: a number both rooms carry is summed into the merged room
  (with zones too: the zones keep their own); it is no longer listed as "said otherwise". Each
  sum, and each number only one room carries, is said with the call. A use change names the
  kept describing facts.
- `packages/floorplan/src/geometry/wallFaults.ts`: tidy's split gives the part `placeFacts` only.
- The new sentences go into `messages/en.ts` (and a draft in `es.ts`), so `ownWords` counts do
  not move. `docs/plan-file.md` (Edits keep them) says the new rule.
- No new message code, no change to `compile.ts`, no new convention.

## Done

- `packages/cli/src/edit/__tests__/countedFacts.test.ts`: a 30-seat office with a department
  split in two: the new room has the department and no seats, the floor's `grid_count` sum is
  30, and the answer names `seats` and `grid_set_facts`. Two offices of 4 and 6 seats merged
  carry 10, said; a meeting room with none merged into a 4-seat office keeps 4 and says so.
- `tidyFacts.test.ts` updated: the part keeps the department, not the head count.
- `zoneFacts.test.ts` still passes (the merged room's head count is the sum, with or without
  zones).
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched.
