# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1.0 | No |

Older or unlisted versions are not supported.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on the intended repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Because the repository is not created yet, open a minimal issue without details to request establishing a private advisory channel before sharing sensitive data. Do not include vulnerability details in a public issue.

## What is in scope

The following components and paths are in scope:

- The `llm/stream` repair path
- The CLI
- The session-log reader
- The redaction used before evidence leaves the machine

## What is out of scope

The following items are out of scope:

- Upstream DSH
- The model relay
- Provider credentials
- A `max-tokens` truncation (which the plugin deliberately does not repair)

## What to include

When submitting a report, include:

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project follows coordinated disclosure. Reports will be investigated and addressed before public release. There is no bug bounty program and no fixed response SLA.
