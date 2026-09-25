# Security Policy

## Supported Versions

Security fixes are provided for the latest published release.

| Version | Supported |
| ------- | --------- |
| 0.9.x   | Yes       |
| < 0.9   | No        |

## Reporting a Vulnerability

Report suspected vulnerabilities privately through GitHub Security Advisories:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include steps to reproduce, affected versions, and any relevant logs.

Please do not disclose the issue publicly before a fix is available. You can
expect an initial response within a few days.

## Scope

This project is an OpenCode plugin that discovers models from 9Router-compatible
endpoints. Never commit real API keys or router credentials to this repository;
use environment substitutions such as `{env:ROUTER_API_KEY}` in configuration.
