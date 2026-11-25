# 2026-11-25: writing into folders that do not exist yet (CMD-19)

## For people

- Grid makes the folders a file needs when it writes it, inside the project folder, for example
  `grid draw --out pictures/plan.svg`. When it can't, it says so in one line (CMD-19).

## For agents

- Tools and commands that write a file (plans, briefs, exports, pictures, sheets) make missing
  folders inside the project instead of answering with `ENOENT`. A name on the way that is a file
  is refused in one line. No new code in the record.
