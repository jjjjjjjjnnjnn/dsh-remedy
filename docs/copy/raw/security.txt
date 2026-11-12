# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | Yes |
| Older or unlisted | No |

Older or unlisted versions are not supported.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on the public repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Do not open a public issue for security reports.

## What is in scope

- The `llm/stream` repair path
- The CLI
- The session-log reader
- The redaction used before evidence leaves the machine

## What is out of scope

- Upstream DSH
- The model relay
- Provider credentials
- A `max-tokens` truncation (which the plugin deliberately does not repair)

## What to include

Include the following details when submitting a report:
- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project practices coordinated disclosure. Reports are handled privately until a fix is released. There is no bounty program and no SLA.
