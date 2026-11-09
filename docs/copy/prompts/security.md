Write the public `SECURITY.md` for the open-source repository `dsh-remedy`.

Required sections:

```
# Security policy
## Supported versions
## Reporting a vulnerability
## What is in scope
## What is out of scope
## What to include
## Disclosure
```

Rules:

- Supported versions: a small table; `0.1.x` is supported, older or unlisted
  versions are not. Do not invent a support window in years.
- Reporting: GitHub private vulnerability reporting on the intended repository;
  do not invent an email address. If the repository is not created yet, say so
  and tell the reporter to open a minimal issue without details until the
  advisory channel exists.
- In scope: the `llm/stream` repair path, the CLI, the session-log reader, and the
  redaction used before evidence leaves the machine.
- Out of scope: upstream DSH, the model relay, provider credentials, and a
  `max-tokens` truncation (which the plugin deliberately does not repair).
- What to include: plugin version, DSH version, OS, provider route, a redacted
  journal excerpt, and the smallest input that reproduces the issue. Say
  explicitly: never paste a real API key or an unredacted session log.
- Disclosure: coordinated disclosure; no invented SLA or bounty.
- Keep it under 80 lines.
