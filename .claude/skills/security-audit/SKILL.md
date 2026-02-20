---
name: security-audit
description: Deep security analysis of the Express+MongoDB+Playwright web app with attack chain tracing, CVE checks, and input validation verification. Runs in an isolated fork.
model: opus
context: fork
agent: general-purpose
allowed-tools: Read Grep Glob Bash(agent-browser *) Bash(netstat *) Bash(tasklist *) WebSearch
---

# Security Audit

Comprehensive security review of the Media Vault application (Vite+React client, Express+MongoDB server, Playwright extraction, ffmpeg downloads).

## Step 1: Open the App

```bash
agent-browser open http://localhost:5173
```

If the app doesn't load, stop and report that the dev server isn't running.

## Step 2: Runtime Security Verification

Use agent-browser to test live security properties:

### XSS via Job Data
```bash
agent-browser eval "document.querySelectorAll('[dangerouslySetInnerHTML]').length"
```
Check if any component renders raw HTML from job/video metadata.

### API Response Shape
```bash
agent-browser eval "fetch('/api/jobs').then(r => r.json()).then(d => JSON.stringify(Object.keys(d)))"
```
Verify all API responses follow `{ ok: true/false }` shape.

### CORS Headers
```bash
agent-browser eval "fetch('/api/jobs', {method:'OPTIONS'}).then(r => [...r.headers.entries()].filter(([k])=>k.includes('access-control')))"
```

## Step 3: Static Code Analysis

Read and analyze these files in order:

### server/ — Express Application
- [ ] All route handlers validate input parameters
- [ ] MongoDB queries use sanitized input (no `$` operator injection)
- [ ] `req.body` fields are validated/typed before use in queries
- [ ] File paths validated against `DOWNLOADS_ROOT` (path traversal prevention)
- [ ] `path.resolve()` + `startsWith()` check before any file operation
- [ ] User-supplied URLs validated before passing to Playwright
- [ ] No SSRF vectors (server fetching arbitrary user-controlled URLs without allowlist)
- [ ] Playwright browser context is properly sandboxed
- [ ] API keys/secrets in `.env` only, never in responses
- [ ] Rate limiting on job submission endpoint
- [ ] ffmpeg arguments are not injectable via user input
- [ ] Download file serving validates path against allowed directory
- [ ] No `eval()`, `Function()`, or `child_process.exec()` with user input
- [ ] Express error handler does not leak stack traces to client

### client/ — React Application
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] User input doesn't flow to `eval` or `Function()`
- [ ] External URLs opened safely
- [ ] No secrets in client-side code
- [ ] API proxy configuration doesn't allow arbitrary proxying

## Step 4: Trace Attack Chains

For every vulnerability found, trace the FULL chain:

```
Entry point -> Handler -> Processing -> Impact
```

### Priority Attack Vectors for This Stack:

1. **NoSQL Injection** — User input flows to MongoDB query operators
   ```
   POST /api/jobs { url: { "$gt": "" } }
     -> route handler reads req.body.url
     -> passes to service without type check
     -> MongoDB interprets as query operator
   Impact: Data exfiltration or query manipulation
   ```

2. **SSRF via Playwright** — Attacker submits internal URL
   ```
   POST /api/jobs { url: "http://169.254.169.254/latest/meta-data" }
     -> URL passes validation (it's a valid URL)
     -> Playwright navigates to AWS metadata endpoint
     -> Response data captured and stored
   Impact: Cloud credential theft
   ```

3. **Path Traversal in Downloads** — Crafted path in download endpoint
   ```
   GET /api/downloads/../../../etc/passwd
     -> route handler joins with DOWNLOADS_ROOT
     -> missing path containment check
     -> arbitrary file read
   Impact: Arbitrary file read (CWE-22)
   ```

4. **Playwright Sandbox Escape** — Malicious page content
   ```
   Target page contains crafted JS
     -> Playwright persistent context executes it
     -> If context has elevated permissions, code runs with node access
   Impact: Remote code execution
   ```

5. **ffmpeg Command Injection** — Crafted media URL
   ```
   Extracted URL contains shell metacharacters
     -> Passed to ffmpeg spawn without sanitization
     -> If using exec() instead of spawn(), command injection possible
   Impact: Remote code execution
   ```

## Step 5: CVE Check

Search for known vulnerabilities in key dependencies:

```
WebSearch: "Express 5 CVE security vulnerability 2025 2026"
WebSearch: "Playwright CVE security vulnerability 2025 2026"
WebSearch: "Mongoose 9 CVE security vulnerability 2025 2026"
```

Also check:
- Vite
- Framer Motion
- ffmpeg (the version in use)

## Step 6: Authentication & Authorization

- Is there authentication on API endpoints?
- Can unauthenticated users submit jobs?
- Can unauthenticated users access/delete other users' downloads?
- Is the bootstrap auth mechanism secure?
- Are session tokens/cookies properly configured (httpOnly, secure, sameSite)?

## Report Format

```markdown
# Security Audit Report

## Critical Findings
(RCE, arbitrary file access, injection vulnerabilities)
For each:
- CWE number
- Full attack chain (entry -> handler -> processing -> impact)
- Fix code
- Effort estimate
- Regression risk

## High Findings
(XSS, SSRF, NoSQL injection, insecure defaults)

## Medium Findings
(Information disclosure, missing headers, weak defaults)

## Low/Informational
(Best practice deviations, hardening opportunities)

## CVE Status
(Known vulnerabilities in dependencies)

## Positive Findings
(Security measures correctly implemented — preserve these)

## Recommended Security Headers
(Complete set of security headers for Express)
```
