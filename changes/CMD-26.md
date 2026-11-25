# 2026-11-25: exports in one encoding, named from the plan, the same twice (CMD-26)

## For people

- An IFC reads a name with an emoji or another character beyond the basic range as typed
  (written as one code point, not two halves).
- The IFC project and building carry the plan's own name, not the file's name; the doors and
  windows carry their id as their tag and a door or window property set.
- `grid export --format ifc --date 2026-01-31`, or `SOURCE_DATE_EPOCH` set, writes the same bytes
  every time.
- A sketch arc that goes all the way round is a circle in the DXF, and a door or window block on a
  curved wall is named by its stated width.

## For agents

- `grid_export` and `grid export` write IFC names with `\X4\` for characters beyond the BMP; the
  IFC project is the plan's `name`, else its `title`, else the file's name; the building is the
  plan's one named building, else the plan's name. `IFCDOOR` and `IFCWINDOW` carry `Tag` = the
  opening's id and `Pset_DoorCommon` / `Pset_WindowCommon` (`Reference`, `IsExternal`). The
  time stamp follows `--date`, else `SOURCE_DATE_EPOCH`. No new code in the record.
