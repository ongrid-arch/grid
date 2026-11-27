# 2026-11-27: the site's address and name, and the plan's language, units and north set in one call (CNT-50)

## For people

- A plan keeps the site's address and its own name ("Harbour House") as you write them, so they live in the plan and not in someone's notes. Grid never looks an address up or checks it against a map. Rooms text writes them as `site address "12 Harbour Road, Bristol"` and `site name "Harbour House"`, and reading the plan back keeps them (CNT-50).
- `grid describe` says the site's name and address, a sheet with no name of its own is named after the site, the address goes under the cover's title and after the project in the title blocks, and the band under a drawing shows it beside the plan's title.

## For agents

- The plan file: `site.address` and `site.name`, free text of one line, at most 120 characters each, optional and never defaulted (C7 widened, no new convention number). An unknown site field is still named as unknown.
- New tool `grid_set_plan`, after `grid_change_site`: the plan's `name`, `site_name`, `address`, `country`, `north` or `north_points`, `language` (a language tag), `units` (`m`, `cm`, `mm` or `ft-in`, written to `display.length`; the file's own `units` stays `m`), `area` (`m2` or `ft2`), `decimal_mark` (`point` or `comma`), `precision` (0 to 5) and `floor_names` (`"<floor id>=<name>"`), each only when given, and `remove`. A floor in the floors list is renamed in its own record; a plan that lists no floors gets its list, in the order its floors are read. Its answer carries `settings`, the plan's settings as it now holds them. The server has 64 tools.
- `grid_set_site` takes `address` and `site_name`, and `remove` takes `address` and `name`.
- `grid_describe` (longer forms): a person's line `The site: "<name>, <address>".` and an agent's line `SITE name "<name>"; address "<address>"`. No new code in the record.
- Left for later: a `language` word on rooms text's `display` line.
