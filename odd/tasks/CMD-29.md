# CMD-29: small protocol and packaging slips

## Outcome

- A request line over the 1 MiB limit is refused unread and answered with the request's own `id`
  when its top level names one, so a client waiting for that answer is not left hanging; with no
  readable id the answer carries null, as before.
- A refusal for a path never prints the project folder's place on the disk.
- `serverInfo.version`, in both eras, the problem report's Grid version and an export's data all
  carry the package's version, the one `grid --version` prints, not "1".
- `docs/tool-server.md` says to start with `node .../grid.mjs mcp` for a faster start.
- `grid_measure` takes `from` for the room a route starts in, and `width` for narrow, as the
  other modes name them; two different values for one thing are refused.
- `grid edit merge --zones true` works as its help says; `--zones false` leaves it out.

## Design

- `mcp/protocol.ts`: `idOfUnreadLine` scans the line once, skipping strings and anything nested,
  for the top-level `"id"` (a number, or a string of at most `REQUEST_ID_MAX` characters); it
  parses nothing. `SERVER_INFO` takes `version` from `package.json`.
- `fs/projectFiles.ts`: the two refusals say "the project folder" without its path.
- `mcp/readTools.ts` (`grid_measure`): `from` becomes `room` for route and `width` becomes `under`
  for narrow before the stray-argument check.
- `mcp/writeTools.ts`: `gridVersion` in the export's data.
- `command/edit.ts`: a boolean option followed by `true` or `false` is read as given.
- Decision: the GLB's `generator` stays "Grid" (the floorplan package keeps exports byte-stable).

## Done

- `mcp/__tests__/protocol.test.ts` (new cases): oversize line with id, nested id ignored,
  no id, long id; serverInfo version in both eras.
- `fs/__tests__` and tool tests: no absolute folder in a refusal.
- `mcp/__tests__/measureNames.test.ts`: route `from`, narrow `width`, conflicts refused.
- `command/__tests__/edit.test.ts`: `--zones true`.
- `ownWords.test.ts` and `tolerances.test.ts` pass.
