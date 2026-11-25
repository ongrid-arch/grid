# 2026-11-25: routes and walks agree with the areas and the check (ARE-18)

## For people

- The way out of a room upstairs or in a basement now goes down or up the stairs to a door on the
  ground, as the way-out check reads it, with its walked length; a balcony door upstairs is no
  longer taken as the way out. A door in a curved wall is walked from either side. When a walked
  length cannot be given, the answer names the room and why. The walk-through goes into every
  room an open side joins, a well in the floor too; from a room's middle it faces square to the
  room and gives its whole size; and an island or a table clear of the walls is said where it
  stands ("its near side 1.4 m ahead, across your way"). `grid describe` says a door leads in
  from outside whenever the check reads it as a way out, and an open side to the outside is a
  way in (ARE-18).

## For agents

- `grid_measure what=route` with `to=outside` follows the way-out check: across floors by the
  stairs it reads (stated stairs and stair rooms, never a lift), out only on a floor not above the
  ground. The answer has `floors` (each room's floor, in the order of `rooms`), steps of `type`
  `stair` (`width` the stated stair's, else null; never the narrowest passage), `onStairs` (metres
  along the stairs on plan, the climb left out) and `gap` (null, or `room`, `reason`
  `no outline`|`doorway`|`no line`, and `via` for a doorway) when `length` is null. The text says
  "… through the walls and 2.80 m along the stairs." and names the room and the reason in place of
  "grid_check says why". A route between rooms, and one with `width`, keep to their floor.
- `grid_describe length=walk`: a stop has `inRoom`, fixtures clear of the walls with `near`
  (`ahead`, `across`: its near side, 0 across when it is across your way); the agent form adds
  `| F <id> f +<m> X|L<m>|R<m>` to a stop that has any, and the KEY line says so. A stop where the
  walk starts with no doorway faces square to the room and its `deep` is the room's whole depth.
- `grid_describe`: an opening's side with no room is `outside` when the check reads it as an exit;
  with no door in, the line says "from outside, no door but an open side leads into …" (agent:
  "from outside across open sides into …").
- No new code in the record.
