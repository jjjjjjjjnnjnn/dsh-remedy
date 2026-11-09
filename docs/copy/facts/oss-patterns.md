# Patterns observed in high-star repositories

Read on 2026-11-09. These are structure notes, not copy.

## vitest-dev/vitest

- Centered logo, then `<h1 align="center">` name, then a one-line description.
- Version badge alone under the header.
- A "Get involved" / docs / examples / why link row.
- `## Features` as a scannable bullet list with links.
- One minimal code block right after the feature list.
- Sponsors and credits near the bottom.
- `## Contribution` and `## License` as the last two sections.

## pmndrs/zustand

- Badge row at the very top (build, size, version, downloads, community).
- A single paragraph that says what it is and why it is different.
- Install command immediately after the paragraph.
- A scope warning (readme written for JavaScript users).
- "First do X", "Then do Y" recipe headings.
- Comparison sections ("Why zustand over redux / context").
- Long recipe body, then TypeScript, best practices, third-party, comparison.
- License at the bottom (implicit via the repo).

## What both do

1. The first screen answers: what is it, why is it different, how do I install it.
2. Badges are small and factual; no badge without a real endpoint.
3. A runnable snippet appears before any architecture explanation.
4. Sections are scannable; prose is short and concrete.
5. Limits and scope are stated, not hidden.
6. Contribution and license are always reachable from the README.
7. No table of contents for a short README; no marketing adjectives in the first paragraph.

## What this repository should copy

- Badges: npm version, CI, license, Node engine.
- One paragraph: a resident repair layer that fixes one measured defect and refuses to hide the rest.
- Install: the official `dsh plugin add` command first, library install second.
- A "What it fixes" section with the measured sample.
- A "How it works" section with the stream sequence.
- A "Safety guarantees" list.
- A "Limits" table — this project's differentiator is that it says what it cannot do.
- "Verify it yourself" commands with the real artifact path.
- Contributing, security, license.
