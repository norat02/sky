# Security Policy

## Scope

This policy applies to the Sky Bird repository, the browser game, the Capacitor Android/iOS wrappers, the Express API under `/api/v1`, the Vercel serverless adapter, database migrations, and the GitHub Actions workflows maintained in this repository.

The production service and third-party providers may have separate policies. A finding in Supabase, Vercel, GitHub, Google OAuth, Google AdSense, Redis, PostgreSQL, or another provider should also be reported to that provider through its official security channel.

## Supported Versions

Sky Bird is currently maintained from the `main` branch. Security fixes are applied to the latest commit on `main`; old commits, preview deployments, unsigned validation artifacts, and abandoned branches are not security-supported.

| Version or artifact | Security support |
|---|---|
| Latest `main` commit | Supported |
| Latest production deployment from `main` | Supported, subject to provider configuration |
| Previous commits and old release artifacts | Best effort only |
| Unreleased forks or modified builds | Not supported |

## Reporting a Vulnerability

**Please do not disclose a suspected vulnerability in a public GitHub issue, pull request, discussion, or social media post.** Include only the minimum information necessary and never attach passwords, access tokens, refresh tokens, private keys, keystores, service-role keys, database credentials, or personal data.

The preferred reporting channel is GitHub's private vulnerability reporting flow:

[Report a vulnerability privately](https://github.com/norat02/sky/security/advisories/new)

If private vulnerability reporting is unavailable, contact the repository owner through the private contact method listed on the [Norat02 GitHub profile](https://github.com/norat02) and request a private security channel. Do not send secrets in the first message.

A useful report contains:

1. A short title and affected component or URL.
2. The security impact and realistic attacker assumptions.
3. Exact reproduction steps or a minimal proof of concept.
4. Affected commit, version, browser, device, or deployment environment.
5. Request/response examples with tokens and personal data removed.
6. Suggested mitigation, if known.
7. Whether the report is already known to another vendor or has been publicly disclosed.

For suspected exposed credentials, report the exposure privately first. If safe and authorized, revoke or rotate the credential immediately through the owning provider; do not commit a replacement secret to the repository.

## Response and Disclosure Targets

These are operational targets, not a guarantee of a particular response time:

| Stage | Target |
|---|---:|
| Acknowledge receipt | Within 3 business days |
| Initial triage | Within 7 business days |
| Severity and affected-scope decision | Within 14 business days |
| Mitigation plan or status update | Within 30 days |
| Coordinated disclosure | By agreement with the reporter after a fix or mitigation is available |

We may ask for additional reproduction details, close reports that are not reproducible, or classify a report as a third-party/provider issue. We will avoid publishing reporter identity or report details without permission, except where disclosure is required by law or necessary to protect users.

## Severity Guidance

Severity is assessed using exploitability, confidentiality/integrity/availability impact, affected users, required privileges, and whether the issue is reachable in production. Examples of high-priority reports include authentication or authorization bypass, arbitrary server-side code execution, SQL injection, cross-user data access, exposed server secrets, token forgery, replay that changes scores or rewards, and a stored XSS affecting other users.

Reports limited to local debug behavior, self-XSS, unsupported modified clients, harmless error messages, dependency advisories that are not reachable in production, or missing hardening without an exploitable path may receive a lower severity. This does not prevent us from tracking useful improvements.

## Security Controls Currently Implemented

The repository currently includes layered controls including API versioning, JWT expiration with issuer/audience validation, server-side session expiry and revocation, role checks, Zod request validation, cursor pagination, Redis/memory rate limiting, idempotency keys, transaction-scoped score submission, PostgreSQL parameterized queries and RLS migrations, anti-cheat and replay checks, security headers, CSP, structured request/error logging, secrets-file checks, and GitHub CodeQL scanning.

The client keeps public `VITE_*` configuration separate from server-only credentials. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `JWT_SECRET`, `SCORE_SIGNING_SECRET`, Google OAuth client secrets, passwords, and Android keystores must never be shipped in the browser bundle, APK/AAB, repository, issue, or workflow log.

AdSense and Google CMP scripts are loaded through the consent-controlled path. Publisher IDs and `ads.txt` values are public; they are not security secrets.

## Verification and Release Checks

The following checks are expected before a security-sensitive release:

```bash
npm ci
npm run build
npm run verify
npm test
npm run test:api
npm run test:api:integration
npm audit --omit=dev --audit-level=high
```

GitHub Actions also runs production dependency auditing and CodeQL. A green workflow means the configured checks passed; it is not a penetration-test certificate or a guarantee that no vulnerability exists. Development-only dependency advisories are tracked separately and must be upgraded with regression testing rather than blindly running `npm audit fix --force`.

Database migrations `001_sky_bird_v2.sql`, `002_security_hardening.sql`, and `003_security_operations.sql` must be reviewed and applied in order in the intended production database. Provider-level HTTPS, RLS, backups, MFA, monitoring, alerting, and restore drills still require deployment-specific verification.

## Safe Testing Rules

Only test systems and accounts that you own or have explicit permission to assess. Do not perform denial-of-service testing, credential attacks, destructive database actions, bulk scraping, spam, or actions that could affect other players. Use a local test environment or an isolated staging account whenever possible. Stop testing and report privately if you encounter real user data or a production secret.

## Acknowledgements

With the reporter's permission, we may acknowledge responsible disclosures in release notes or this file. We do not offer a bug bounty unless a separate written program says otherwise.

## References

- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Vulnerability Disclosure Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html)
- [GitHub Security Advisories documentation](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories)
