# 2026-11-25: the guide says a word that is not a use is refused by rooms text (CMD-28)

## For people

- The guide for agents no longer says an unknown room use is only noted. It says rooms text
  refuses the word on its line and lists the uses it takes, and that `other` or `-` is the way
  out; only a plan file reads it with no use and a note (CMD-28).

## For agents

- `grid://guide` and `docs/agent-guide.md`: the section on which word is the use says that
  `kennel`, or any word not in the table, is refused by rooms text (`rooms/unknown-use`) with
  the list of uses, and nothing is written. No new code in the record.
