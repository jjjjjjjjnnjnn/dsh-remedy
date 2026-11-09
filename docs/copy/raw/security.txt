# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Older or unlisted | No |

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on the public repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Do not open a public issue.

## What is in scope

- The `llm/stream` repair path
- The CLI
- The session-log reader
- The redaction used before evidence leaves the machine

## What is out of scope

- Upstream DSH
- The model relay
- Provider credentials
- A `max-tokens` truncation, which the plugin deliberately does not repair

## What to include

When reporting an issue, provide:

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project follows coordinated disclosure. There is no bounty program and no service level agreement.
