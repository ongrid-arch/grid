# 2026-11-25: an edit says which use it read a word as (WRT-58)

## For people

- `grid edit rename --use gym` is read as `sport`, as rooms text reads it, and the answer now says
  so: Read "gym" as the use sport. This holds for every edit that takes a use.

## For agents

- The tools that change the plan answer with one extra line, `Read "<word>" as the use <use>.`, for
  each use word they read as another use (`gym` as `sport`, `cocina` as `kitchen`). A use given as
  it is, in any capitals, adds nothing. The data is unchanged.
- No new code in the record.
