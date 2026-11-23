# Grid site drafts

Static HTML and plain CSS, no build step, no scripts, no external fonts. Drafts only: nothing here is published.

## Placeholders to replace before publishing

- The origin `https://ongrid.example` appears in canonical links, Open Graph URLs, hreflang tags, JSON-LD, `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`. Replace it everywhere at once once the domain is chosen (owner decision), for example:
  `rg -l 'https://ongrid.example' site | xargs sd 'https://ongrid.example' 'https://<real domain>'`
- The hosted-server address `https://ongrid.example/mcp` (use pages for Grok, Perplexity and Le Chat) is a placeholder: no hosted server exists.
- `privacy.html` and `support.html` are marked "Draft — not legal advice, needs owner review" and name open items (log retention, a contact address).
- `robots.txt` allows the training crawlers too; that is owner decision 5.
- No `og:image` is set: add one when an image exists.
- The Spanish pages are one neutral version (dormitorio and recámara, plano and planta). Review them with a native speaker.

Install lines come from `packages/cli/src/distribution/listing.ts` through the README's install section; a change there must reach the `use/` pages by hand.
