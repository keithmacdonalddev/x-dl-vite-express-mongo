/**
 * Auth configuration per platform.
 * Maps platform IDs to login URLs and session detection settings.
 *
 * Consumed by:
 *   - server/src/services/auth-service.js (connect, status, disconnect)
 *   - server/scripts/auth-bootstrap.js (CLI login flow)
 *
 * This is a pure data module with zero runtime dependencies.
 */
const AUTH_CONFIG = Object.freeze({
  x: Object.freeze({
    loginUrl: 'https://x.com/login',
    sessionCookieDomains: Object.freeze(['.x.com', '.twitter.com', 'x.com', 'twitter.com']),
    sessionIndicatorCookies: Object.freeze(['auth_token', 'ct0']),
  }),
  tiktok: Object.freeze({
    loginUrl: 'https://www.tiktok.com/login',
    sessionCookieDomains: Object.freeze(['.tiktok.com', 'tiktok.com', 'www.tiktok.com']),
    sessionIndicatorCookies: Object.freeze(['sessionid', 'sid_tt', 'passport_csrf_token']),
  }),
});

module.exports = { AUTH_CONFIG };
