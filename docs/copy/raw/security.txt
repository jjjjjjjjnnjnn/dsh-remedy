# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.3.x | Yes |
| Older or unlisted | No |

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on the public repository.

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

Include the following in the report:

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project follows coordinated disclosure. There is no bounty and no SLA.
