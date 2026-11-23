# The prompt panel

Read this when you measure whether AI assistants name, cite or call Grid. One check proves
nothing: from one day to the next, 50–83% of an assistant's citations change. So the panel runs
the same prompts on the same weekday every week, three times each, in a fresh or logged-out
session.

## What each run records

| Field | Meaning |
|---|---|
| `named` | Grid (or `ongrid`) appears in the answer text |
| `cited` | A Grid page (repository, site, docs) is linked as a source |
| `called` | With Grid installed: Grid's tools were called (C prompts only) |
| `others` | The other tools named or cited, in order |

Being cited and being named are separate results; record both.

## The prompts

| ID | Language | Prompt | Tests | Run in |
|---|---|---|---|---|
| A1 | EN | What AI tool can design a floor plan from a description? | Category discovery | ChatGPT, Claude, Gemini, AI Overviews, Perplexity, Copilot, Grok, Meta AI |
| A2 | EN | Is there an MCP server for designing and checking floor plans? | Developer discovery | Same, plus Cursor, Claude Code, Codex |
| A3 | EN | Check my floor plan against the IBC with AI — free or open source | Code-check niche | Chat apps |
| A4 | EN | What is Grid (ongrid) for architects? | Accuracy once named | All |
| A5 | EN | Grid (ongrid) vs ArchLang vs Maket | Comparison | ChatGPT, AI Mode, Perplexity |
| B1 | ES | ¿Qué herramienta de IA puede diseñar un plano de planta a partir de una descripción? | Category discovery | Chat apps, AI Overviews |
| B2 | ES | Servidor MCP para diseñar y revisar planos de arquitectura | Developer discovery | Chat apps, coding agents |
| B3 | ES | Revisar un plano con el CTE usando IA | Code-check niche (Spain) | Chat apps |
| B4 | ES | Generar plano de planta con IA desde ChatGPT o Claude | In-assistant use | Chat apps |
| B5 | ES | ¿Qué es Grid (ongrid) para arquitectos? | Accuracy once named | All |
| C1 | EN | (Grid installed) Design a two-bedroom flat, about 70 m², and check it. | Direct call | Claude Code, Codex, Cursor, Copilot, Claude Desktop/Cowork, ChatGPT |
| C2 | ES | (Grid installed) Hazme la distribución de un piso de dos dormitorios y compruébala. | Indirect call | Same |
| C3 | EN | (Grid installed) Write a cover letter for an architecture job. | Negative: Grid must not be called | Same |

C1–C3 measure precision and recall of tool choice: Grid called when it should be (C1, C2) and
not called when it should not (C3).

## The log

One CSV per week, `measure/YYYY-Www.csv` (kept outside git), with one row per run:

```csv
date,assistant,prompt_id,run,named,cited,called,others,notes
2026-11-23,ChatGPT,A1,1,no,no,,Maket;Planner 5D,
```

## Free signals beside the panel

- `utm_source=chatgpt.com` on visits from ChatGPT links.
- An "AI referrers" channel: chatgpt.com, claude.ai, perplexity.ai, gemini.google.com,
  copilot.microsoft.com. Many AI clicks arrive with no referrer.
- Bing Webmaster Tools' AI Performance report (Copilot citations).
- Server logs filtered by answer-bot names.
- npm weekly downloads and plugin install counts, once published.

## First-year goal

Named in A2, B2 and A4/B5 most weeks in most assistants; called in C1 and C2, never in C3.
Named in A1 and B1 is a long-term goal.
