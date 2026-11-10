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
- `release_blurb`: a short Markdown section for the current release (0.3.0). It
  must mention that P-0001 and P-0002 are verified on a real host, that P-0003 is
  `tested` with negative controls (a live host writes the eight counters but only
  as zeros on a clean repair), that the counter
  line now carries eight names while the four verdict words are unchanged, and
  link to the live evidence path.
- `social_preview`: one sentence of alt text for a social preview image. No
  invented image URL.

Rules:

- Output only the JSON object. No code fence, no commentary, valid JSON.
- Use only numbers from FACTS.
- npm publication is a fact now; do not claim a user count.
- The description must be honest about what is verified and what is only tested;
  if that does not fit in 160 characters, leave the distinction to the README
  status section.
