# CMD-19: writing into a folder that is not there yet

## Outcome

An agent or person who writes a plan, an export, a picture or a sheet to a path whose folders do
not exist yet gets the file: Grid makes the missing folders, always inside the project folder.
When it can't (a name on the way is a file, or permission is denied) it refuses in one line that
names the file, with no stack trace and no absolute path of the machine.

## Design

- `packages/cli/src/fs/projectFiles.ts`, `Project.writeFile`: after the path is located and
  checked (so it is inside the real project folder, links followed), the folders above it that
  are missing are made with a recursive `mkdir`. `writable` (the check before a long job) no
  longer refuses a missing folder; it refuses only when a name on the way is a file (`ENOTDIR`),
  so the check and the write agree.
- `createFile`, `appendText`, `makeFolder` and `grid init`'s project folder keep their rules:
  `init` still refuses a folder whose parent is missing.
- The command's one-line refusals (`writeRefusal`) and the tool server's wrapper already turn an
  error into one line; `ENOTDIR` and `EACCES` go through them.
- Decision: make the folders rather than refuse, because the agent asked for that path and the
  project folder is already the limit.

## Done

- `fs/__tests__/projectFiles.test.ts`: a write makes the missing folders; one through a link out
  of the project is still refused and makes nothing; a file on the way refuses with `ENOTDIR`;
  `writable` writes nothing.
- The e2e and unit tests that expected a missing `--out` folder to refuse now expect it made.
- `npm run typecheck`, `npm run lint`, the cli test folder and the scoreboard pass.
