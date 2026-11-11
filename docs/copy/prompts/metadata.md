Write the public repository metadata for `dsh-remedy` as one JSON object.

Keys:

- `description`: at most 160 characters, the GitHub repository description. Must
  name the defect family and the repair, not the technology stack. Do not mention
  npm publication status here.
- `plugin_description`: the npm `description` for the `dsh-remedy` package, at
  most 200 characters, same rules.
- `core_description`: the npm `description` for the `dsh-remedy-core` package, at
  most 200 characters; name the pure engine and the guarantee.
- `topics`: 8 to 12 lowercase GitHub topics, no `#`, no spaces. Include the DSH
  ecosystem, the defect family, the category, and `typescript`. Do not use
  language names other than `typescript`, and do not repeat `deepseek` when
  `deepseek-harness` is already present.
- `release_blurb`: a short Markdown section for the current release. Do not
  hardcode a version number; take the release status from FACTS, which names
  `0.3.3` as published and as the `latest` release of both packages. It must
  say that plugin 0.3.0 carries a literal `workspace:*` dependency and cannot be
  installed from the registry, that 0.3.1 was superseded before it reached the
  registry, that P-0001, P-0002 and P-0003 are all verified on a real host
  (P-0003's live run is the one whose journal wrote a non-zero `refused`), that
  P-0004 and P-0005 are tested rather than verified (P-0004 moves an offline
  reader, P-0005 has no live bare-value shape yet), that the counter line carries
  eight names plus the optional `resealed` while the four verdict words are
  unchanged, and link to the live evidence paths.
- `social_preview`: one sentence of alt text for a social preview image. No
  invented image URL.

Rules:

- Output only the JSON object. No code fence, no commentary, valid JSON.
- Use only numbers from FACTS.
- npm publication is a fact now; do not claim a user count.
- The description must be honest about what is verified and what is only tested;
  if that does not fit in 160 characters, leave the distinction to the README
  status section.
