# 2026-11-25: a camera inside a wall says so (VEW-59)

## For people

- A 3D or eye picture whose camera stands inside a wall no longer comes back as one flat field with no word: the answer names the wall and gives a distance that stands the camera clear of it (VEW-59).

## For agents

- `grid_view` kind=3d and kind=eye, add one line to the camera lines when the camera stands inside a wall the picture draws: the wall's id and a distance from the target that clears every wall (none for a camera looking straight down). A camera in a door or window opening is not inside the wall. No new code in the record.
