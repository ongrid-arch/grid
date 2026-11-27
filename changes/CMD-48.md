# 2026-11-27: a command for every reading tool, and --fail-on for CI (CMD-48)

## For people

- New commands `grid areas`, `grid schedule`, `grid takeoff`, `grid measure <what>`, `grid count`, `grid find`, `grid fields`, `grid compare <plan> <plan>...` and `grid brief`, each running the tool server's reading tool of that name (`grid brief` reads the brief beside the plan and writes nothing) with the tool's own arguments as options. `--json` prints exactly the tool's structured answer, `--csv` a table where there is one (`grid areas --format csv` works too), and `--fail-on` exits 3 after printing the answer when it holds a condition, so CI can stop on it: `grid find --kind door --where "width < 0.8" --fail-on found`, `grid measure narrow --under 0.8 --fail-on short`, `grid brief --fail-on missed`. `grid check` takes `--fail-on problems` and `--fail-on notes` (a note not set aside as seen) and otherwise still exits 0 (CMD-48).

## For agents

- No tool answers differently and there is no new code in the record. The command line's `grid areas`, `schedule`, `takeoff`, `measure`, `count`, `find`, `fields`, `compare` and `brief` with `--json` print the same record as the tool's `structuredContent` (`whole: true`, so never with `left_out`), for scripts written against either. A new exit code, 3, means the answer held the condition `--fail-on` named.
