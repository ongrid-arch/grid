# 2026-11-27: a flat's front door onto the common landing is its way out (ARE-70)

## For people

- A flat drawn on its own up in a building leaves by its front door onto the common landing: when that door is in a party wall or a wall to the common parts, `grid check` follows every room to it and no longer says that no stair joins the floor to the ground, and the route to outside ends there. A front door in a wall that marks nothing, read as a door out high above the ground, now comes with how to mark it (ARE-70).

## For agents

- `grid_check`: a floor that no stair joins to a drawn ground floor, with a door or open side onto the common parts (a `separating` wall, or `beyond: "common"`), is checked from those ways: `floor/not-checked-way-out-common-parts` instead of `floor/not-checked-no-stairs`, no `floor/no-stair`, and `room/no-route-to-door-out` for a room cut off from them. The fix of `opening/door-out-above-ground` says how to mark a front door onto the landing.
- `grid_measure what=route to=outside`: when no way out is reached, the way onto the common parts is the way out: its last step goes `into` `common parts`, the answer carries `onto: "common parts"`, `exit` and `otherExits` as for any way out, a line that the way on is not followed, and the body or trolley measured to that door. With no way found from a floor above the ground, each door out of it is named with its height and wall, and how to mark it. No new code in the record.
