# 2026-11-25: a default type says how many parts take it (WRT-60)

## For people

- Making a type the default now says how many walls, doors or windows take it, and when none do,
  says why and offers the other wall kind.

## For agents

- `grid_change_type` with `default: true` answers with the count of parts that take the type,
  including parts that name no type. With none, the answer says "No wall takes it", counts the
  interior and exterior walls and offers the other kind. No new code in the record.
