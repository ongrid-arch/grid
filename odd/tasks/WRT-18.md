# WRT-18: refuse any edit that would write a new drawing problem

## Outcome

`tool-server.md` promises that a change that would leave the drawing with a new problem is
refused and nothing is written. Until now the last check before writing refused only new
errors, and compared them by their sentence, so every new warning went through: moving a side
past the opposite wall (a room no walls enclose, two rooms counted twice), a wall that now ends
inside a door, a merge that left a room not matching its walls, and a 6 m door that ran across
the walls meeting its wall into the next room. After this change `grid_move_room_side`,
`grid_stretch`, `grid_merge_rooms`, `grid_change_opening` and every other change that goes
through the same check refuse, write nothing and name the problems, when the drawing has a
problem after the change that it did not have before. A side that cannot move as far as asked
is refused with the largest move that way that fits, in metres and as the inside size, so the
agent can ask again with a figure that works. A wall drawn to the face of the moved wall,
rather than to its centre line, now follows it as a wall that ends on its centre line does.

## Design

- `packages/cli/src/edit/fit.ts` (new): `newProblems(before, after)` compares the drawing's
  issues by code and part, counted, so a problem that only changes its figures is not new, and
  one that appears is, of any severity. Left out, because they report the design asked for and
  not a fault: a fixture's fit (`item/`, which `grid_place_item` answers), a floor that sits
  back from the one below (`floor/out-of-line`, an extension), and a wall's stated kind read
  otherwise (`wall/kind-differs`, kept as stated). A warning left on a part whose error the change
  clears is not new: the fix calls Grid offers move a door clear of the wall's end into a corner.
  `problemsText` names up to three problems. `largestFit` finds the largest move up to the one
  asked for that fits, by halving to the centimetre and checking the figure it gives;
  `sideMoveThatFits` moves a side or refuses with the problems and that move (`by`, and the
  inside size it leaves). A move must leave every room on the moved wall at least 0.30 m across
  (`NARROWEST_ACROSS`, the least `to` the tool takes), or a side could pass to a 2 cm room.
- `packages/cli/src/mcp/writeTools.ts` (`writeChange`, the edits' one final check; outside the
  card's folder by a few lines, because the check lives there): refuses with `newProblems`, and
  hands `make` a second argument, `problemsOf(patch)`, the same check for a patch not yet
  returned. `grid_move_room_side` goes through `sideMoveThatFits`.
- `packages/cli/src/edit/edits.ts` (`moveRoomSide`): a wall follows when its end is within half
  the moved wall's thickness of its centre line, on either face, not only on the line itself.
- Decisions: the comparison is by code and part, not by the sentence, because the sentence
  carries figures that every move changes. A problem of a code and part that was there before
  is not new even when its figures grow; that keeps old plans editable. No new message code, no
  new convention.

## Done

- Tests that fail before, in `packages/cli/src/edit/__tests__/newProblems.test.ts`: on the
  sample flat, moving a bedroom's side past the opposite wall, moving the kitchen's north wall
  so a wall ends inside a door, and widening a door across the wall that meets its wall are
  refused, the file is not written and the answer offers the largest move that fits, which
  itself is written with no new problem; a partition drawn to the face of the moved wall
  follows it.
- `changes/WRT-18.md`; `docs/tool-server.md` says the largest move is offered.
- `npm run typecheck`, `npm run lint`, the cli and rules test folders, `npm run scoreboard`.
