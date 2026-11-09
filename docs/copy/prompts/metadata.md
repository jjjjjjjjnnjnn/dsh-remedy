Write the public repository metadata for `dsh-remedy` as one JSON object.

Keys:

- `description`: at most 160 characters, the GitHub repository description. Must
  name the defect family and the repair, not the technology stack. Do not mention
  npm publication status here.
- `plugin_description`: the npm `description` for the `dsh-remedy` package, at
  most 200 characters, same rules.
- `core_description`: the npm `description` for the `@dsh-remedy/core` package, at
  most 200 characters; name the pure engine and the guarantee.
- `topics`: 8 to 12 lowercase GitHub topics, no `#`, no spaces. Include the DSH
  ecosystem, the defect family, the category, and `typescript`. Do not use
  language names other than `typescript`, and do not repeat `deepseek` when
  `deepseek-harness` is already present.
- `release_blurb`: a short Markdown section for the first release (0.1.0). It
  must mention that the patch is verified on a real host and link to the live
  evidence path.
- `social_preview`: one sentence of alt text for a social preview image. No
  invented image URL.

Rules:

- Output only the JSON object. No code fence, no commentary, valid JSON.
- Use only numbers from FACTS.
- Do not claim npm publication or a user count.
- The description must be honest that npm is not published yet only if it fits
  in 160 characters; otherwise leave that to the README status section.
