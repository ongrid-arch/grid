# 2026-11-26: the areas read the plan's own country (ARE-59)

## For people

- A plan that states where it will be built now gets the gross area usual there without being told again; saying a country still overrides it.

## For agents

- `grid_areas` and every reader of the areas take the plan's `site.country` as `grid_check` reads it (a name or a code); the `country` argument only overrides it. A plan stating GB gets gross internal first, with no "no country was given" note. No new code in the record.
