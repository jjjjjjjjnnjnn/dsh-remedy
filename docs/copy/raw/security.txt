# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |
| Older   | No        |

Older or unlisted versions are not supported.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on the public repository: https://github.com/jjjjjjjjnnjnn/dsh-remedy

Do not open a public issue for a security vulnerability.

## What is in scope

- The `llm/stream` repair path
- The CLI
- The session-log reader
- Redaction used before evidence leaves the machine

## What is out of scope

- Upstream DSH
- The model relay
- Provider credentials
- A `max-tokens` truncation (which the plugin deliberately does not repair)

## What to include

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project follows coordinated disclosure. Reports are handled privately until a fix is released. There is no bounty and no SLA.
