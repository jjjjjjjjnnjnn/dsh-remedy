# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | Yes |
| Older or unlisted | No |

## Reporting a vulnerability

GitHub private vulnerability reporting is enabled on the public repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Submit vulnerability reports through the repository security tab. Do not file public issues or pull requests for security vulnerabilities.

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

Reports should include:

- Plugin version
- DSH version
- OS
- Provider route
- A redacted journal excerpt
- The smallest input that reproduces the issue

Never paste a real API key or an unredacted session log.

## Disclosure

This project practices coordinated disclosure. Confirmed vulnerabilities are addressed through standard repository updates and releases. There is no bug bounty and no SLA.
