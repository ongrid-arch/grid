# 2026-11-25: the walls line holds for rooms sized to centre lines, and on every floor after it (WRT-47)

## For people

- Rooms text written on a grid with sizes to the walls' centre lines (`12 x 10.8 centre at 12,0`)
  gets the inside walls its `walls` line gives, 0.1 m say, where it used to write every inside
  wall as thick as the outside ones. A room sized to centre lines or outside faces and placed by
  its corner is placed by the corner its size measures to, so the walls' centre lines lie on the
  grid the corners are written on. A second `walls` line no longer rewrites the floors written
  before it, and a floor whose own height differs from the walls line's says which one its walls
  took (WRT-47).

## For agents

- `grid_write_rooms` and `grid write`: `at x,y` on a room sized `centre` or `outside` (or under
  `sizes centre`, `sizes outside`) names the south-west corner its size measures to, no longer its
  inside corner, and the first room with no place puts that corner at 0,0. Two such rooms placed
  by their corners whose sizes meet on a line have the wall a `wall between` line, the rooms'
  `walls` or the walls line gives between them, centred on that line; two sized to outside faces
  give up half that wall each. Their inside sizes in the answer come from those walls.
- A walls line applies to the floor it is written on while that floor has no rooms, and to every
  floor after it; a copied floor keeps the walls of the floor it copies. Written after a floor's
  rooms it is said as `rooms/walls-late`, naming the floor and the walls it keeps. A floor whose
  stated `height` differs from the walls line's is said as `rooms/walls-height`; its walls still
  take the floor's height. Both are warnings of the rooms-text answer. No new code in the record.
