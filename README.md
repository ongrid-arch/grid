# Grid

Grid (ongrid): floor plans for AI agents

Grid is a floor-plan toolkit built for AI agents. Describe a home or a building to your agent
and it draws, measures, checks and changes the plan with Grid. Anyone can use it: homeowners,
architects, builders, students.

One structured plan file (walls, rooms and openings) is the source of truth. It is stored in
metres and shown in each person's own units: metres, centimetres, millimetres, or feet and
inches. A geometry core reads it, validates it, draws it in 2D and 3D, and feeds the exporters.

## Quick start

Grid is not on npm yet: build it from a copy of this repository, then write a first plan.

1. `npm ci && npm run build`, then `alias grid="node $PWD/packages/cli/dist/grid.mjs"`.
2. `grid init my-home && cd my-home` makes a project folder with an empty `plan.json`.
3. Write the rooms below in `plan.rooms`: each room with its use and inside size, the doors and windows by the rooms they join.
4. `grid write plan.rooms` works out the walls into `plan.json`, `grid check` checks it, and `grid draw --out plan.svg` draws it.
5. An agent gets the same as tools with `claude mcp add grid -- node <this folder>/packages/cli/dist/grid.mjs mcp`, and reads [the guide for agents](docs/agent-guide.md) first.

```rooms
room living  "Living room" living  4.0 x 3.5 at 0,0
room kitchen "Kitchen"     kitchen 2.5 x 3.5 east of living
door front in living south, centred, 0.9 wide, opens in
opening pass between living and kitchen, centred, 0.9 wide
window w-kitchen in kitchen east, centred, 1.2 wide
```

Write a plan rooms first, the main way to write one: name the rooms with their inside sizes and neighbours, and the doors and windows by the rooms they join, and grid_write_rooms works out the walls.

A room's size is to the inside faces of its walls, unless its line says centre or outside. A stair is a room used as stair on every floor it joins, in the same place (through <top floor> writes it once); a lift is a room used as lift. A room's use is one of Grid's words: an office is office, a toilet or a WC is toilet, and the room's name keeps the person's own word. Where one open space has parts, such as a kitchen open to a living room, the line between them is a dividing line with no thickness: open on the room line, or a virtual wall. An L-shaped room is one room, written with polygon and its inside corners.

## Status

This repository is being set up. The packages hold working code with tests, but nothing
is published yet and there is no release to install.

## Layout

| Path | Package | Contents |
|---|---|---|
| `packages/floorplan` | `@ongrid/floorplan` | Plan schema, geometry, validation, plan checks and exporters |
| `packages/rules` | `@ongrid/rules` | Checks that apply figures from building codes, with each figure's source |
| `packages/viewer` | `@ongrid/viewer` | 2D and 3D views of a plan, `planToSvg` (a picture of a plan as an SVG file) and `planStill` (a still of the 3D model as pixels), with no browser |
| `packages/cli` | `ongrid` | The `grid` command (`ongrid` does the same): `init`, `edit`, `check`, `describe`, `draw`, `export`, `tidy`, `preview` (the preview page in a browser), `serve` (the tool server an agent uses) and `mcp` (the same server). Also CAD program lookup, `drawPlan` (a plan as SVG or PNG) and `drawStill` (the 3D model as PNG) |

## Development

Grid needs Node 22 and npm.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

## Running Grid from a copy of the repository

```bash
npm ci
npm run build
npx --no grid check packages/cli/fixtures/two-bed-flat.json
```

`npx --no ongrid` runs the same command, and so does `node packages/cli/dist/grid.mjs`. Keep
the `--no`: without it, npx fetches a package of the same name from the registry when the
local one is missing.

Every command, with its options, is in [docs/commands.md](docs/commands.md).

## Installing Grid in an agent

Not yet: the package is not published, and publishing waits on the owner's approval (CMD-8).
Once it is, one line starts Grid's tool server for any agent that runs tools on the person's
computer, and the lines below are the ones to type. They all come from one file,
`packages/cli/src/distribution/listing.ts`, and a test fails when this list no longer matches it.

Every way below starts Grid's tool server with `npx -y ongrid mcp`.

- Claude Code: `claude mcp add grid -- npx -y ongrid mcp`
- Codex: `codex mcp add grid -- npx -y ongrid mcp`
- VS Code: `code --add-mcp '{"name":"grid","type":"stdio","command":"npx","args":["-y","ongrid","mcp"]}'`
- Copilot CLI: `copilot mcp add grid -- npx -y ongrid mcp`
- Cursor: [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=grid&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm9uZ3JpZCIsIm1jcCJdfQ==)
- Claude Code, as a plugin with a skill: `/plugin marketplace add ongrid-arch/grid`, then `/plugin install grid@grid`
- Codex, as a plugin with a skill: `codex plugin marketplace add ongrid-arch/grid`
- Claude's desktop app: open the `.mcpb` file for your computer and pick the project folder.

Until publishing, pack everything from a copy of the repository, and install from the tarball:

```bash
npm run build
npm run pack:local --workspace ongrid
npx -y --package=./packages/cli/dist/release/ongrid-0.0.0.tgz ongrid mcp
```

`pack:local` publishes nothing. It writes into `packages/cli/dist/release/` the npm package as
a tarball (the bundled command and nothing else; the canvas that draws PNGs is an optional
package), the registry's `server.json`, the plugin for Claude Code and Codex with a marketplace
folder that lists it, `install.md` with the lines above, and a `.mcpb` bundle for Claude's
desktop app that carries the canvas for the computer it was packed on. The plugin lines above
name the repository, so they work once its marketplace files are committed at the top (CMD-8).

## Documentation

Each page answers one kind of question, so read only the one you need.

| To… | Read |
|---|---|
| Write a first plan as an agent: rooms first, the raw-wall form, and the answers to what agents ask (a stair, the use words, inside or outside, dividing lines, L-shaped rooms) | [docs/agent-guide.md](docs/agent-guide.md) |
| Know the plan file's conventions, each with a drawing: wall thickness, where an opening sits, room boundaries, coordinates and floors | [docs/conventions.md](docs/conventions.md) |
| Start from a realistic plan: a flat, a two-storey house and an open-plan home, as rooms text and as plan files | [docs/samples/](docs/samples/) |
| Write a plan: name the rooms, doors and windows, and let Grid work out the walls | [docs/rooms-first.md](docs/rooms-first.md) |
| Run a command: `init`, `write`, `edit`, `check`, `describe`, `draw`, `export`, `sheet`, `tidy`, `occupancy`; options, exit codes, the project folder | [docs/commands.md](docs/commands.md) |
| Call Grid as an agent: the `grid_…` tools, asking across the parts by their facts, measuring from faces, protocol versions | [docs/tool-server.md](docs/tool-server.md) |
| Know what a plan file may hold and what each drawing check's code means: floors, steps, overlapping rooms, holes, fixtures, facts of your own and room numbers, wall faults, inside and outside walls, and where people's names go instead | [docs/plan-file.md](docs/plan-file.md) |
| Keep what the person asked for beside the plan, and read each line met or missed after a change | [docs/brief.md](docs/brief.md) |
| Set a firm's own standards, such as corridors at least 1.5 m, against its plans, apart from the code figures; the skills a firm can own | [docs/firm-standards.md](docs/firm-standards.md) |
| Place a fixture, furniture or a typical room by name; keep an office's own library; add a kind of thing | [docs/library.md](docs/library.md) |
| Know what an area figure means: net, gross internal and gross external, and which comes first where; the room schedule and the door and window schedule | [docs/areas.md](docs/areas.md) |
| Open a GLB or OBJ in a game engine, a renderer or a headset: its axes, units, node and object names, materials, normals and UVs, and leaving the roofs out | [docs/3d-files.md](docs/3d-files.md) |
| Know the figure behind a check, and when Grid asks whether a size is meant | [docs/tolerances.md](docs/tolerances.md) |
| Read what `grid check` and `grid_check` return: the record and every message code | [docs/result-contract.md](docs/result-contract.md) |
| Add or change a sentence Grid writes, or add a language: the message files, `--lang`, room uses by language | [docs/languages.md](docs/languages.md) |
| Change Grid itself | [AGENTS.md](AGENTS.md) |

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
