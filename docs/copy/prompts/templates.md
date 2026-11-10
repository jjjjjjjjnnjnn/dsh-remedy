Write four public GitHub files for `dsh-remedy`, separated by exact markers.
Each marker starts a new file; the marker line is not part of the file.

Marker format (use exactly this shape on its own line):

```
<<<FILE: .github/ISSUE_TEMPLATE/bug_report.yml>>>
```

Files and requirements:

1. `<<<FILE: .github/ISSUE_TEMPLATE/bug_report.yml>>>`
   GitHub issue form YAML (schema: name, description, title, labels, body).
   Fields: dsh-remedy version, DSH version, OS, provider route, what happened,
   expected behavior, `dsh-remedy status --json` output, redacted journal
   excerpt, redacted session excerpt, and a confirmation that no API key or
   unredacted session was pasted. Use these exact ids:
   `remedy_version`, `dsh_version`, `os`, `provider_route`, `what_happened`,
   `expected_behavior`, `status_output`, `journal_excerpt`, `session_excerpt`,
   `confirmation`. The four environment fields (version, DSH version, OS,
   provider route) MUST each have `validations:` / `required: true`, exactly like
   the repro textareas. A `checkboxes` item must NOT have a top-level
   `validations` key; put `required: true` on the option instead. Valid YAML,
   two-space indentation, no tabs.

2. `<<<FILE: .github/ISSUE_TEMPLATE/feature_request.yml>>>`
   Issue form: the problem, the proposed change, alternatives considered, and a
   scope checkbox that points at the project rule "one seam per patch". Valid
   YAML.

3. `<<<FILE: .github/ISSUE_TEMPLATE/config.yml>>>`
   `blank_issues_enabled: false` and exactly one contact link named
   "Security policy" whose URL is
   `https://github.com/jjjjjjjjnnjnn/dsh-remedy/security/policy`.
   Do not invent a Discord or an email.

4. `<<<FILE: .github/PULL_REQUEST_TEMPLATE.md>>>`
   Sections: What changed, Why, Failing test, Evidence, Limits, Checklist.
   The checklist must include `pnpm run verify`,
   `node scripts/gate.mjs --mutate`, a test for behavior changes, and an evidence
   path when the patch claims `verified`.

Rules:

- Use only facts from FACTS. The version is `0.3.0`.
- No emoji, no exclamation marks.
- Each file must be directly usable by GitHub without edits.
