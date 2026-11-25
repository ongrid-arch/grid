# 2026-11-25: 3D views framed to the building, and long floors drawn in pieces (VEW-26)

## For people

- A 3D view Grid frames itself now fills the picture with the building: the camera stands as far
  as the building needs from where it looks, no further, and points at its middle. A tower is
  taken in a portrait picture. Naming a room fills the picture with that room. An eye-level view
  from outside looks level, so walls stand upright. A floor far longer than it is wide is drawn
  a piece at a time, large enough to read (VEW-26).

## For agents

- `grid_view kind=3d` takes `fit`: `building` or `room`, what fills the frame. With no `camera`,
  `view` or `distance`, Grid fits the room named, else the building: the distance comes from the
  box of what is drawn, the bearing, tilt and lens, not from 2.2 times the building's largest side,
  and `target.point` is the middle of what is seen. `fit` with `camera` or `view` frames that
  camera again; `fit` with `distance`, and `fit=room` with no room, are refused. A building taller
  than it is wide comes back with `aspectRatio` 0.666667 and an 800 × 1200 picture. `eye_height`
  alone, pointed at no room, gives `tilt` 0, the camera at that height, standing back until the
  building fits. The answer adds a line naming what the picture was framed to.
- `grid_view kind=plan` says when a floor is far longer than it is wide and too small to read
  whole, with how many pieces it is drawn in, and takes `tile` (1 to that count) to draw one, each
  overlapping the next, at 12 px a metre or more. `tile` on a floor drawn whole, past the count,
  not a whole number, or with `crop`, is refused. No new code in the record.
