# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.3.x | Yes |
| Older or unlisted | No |

Older or unlisted versions are not supported.

## Reporting a vulnerability

GitHub private vulnerability reporting is enabled on the public repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Please submit security vulnerability reports through GitHub private vulnerability reporting. Do not open public issues or public discussions for security reports.

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

When reporting a vulnerability, include:

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project follows coordinated disclosure. There is no bounty program and no SLA.
