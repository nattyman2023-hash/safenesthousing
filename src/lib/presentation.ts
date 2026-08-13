/** Narrow presentation-only escape hatch for Phase 1 (the production-ready UAT build).
 *
 * When SAFE_NEST_PRESENTATION_MODE=true the application is built and run as a normal production
 * bundle but continues to behave like the finished product demo:
 *  - fictional (seeded) data stays visible whenever the database is momentarily unreachable, and
 *  - unconfigured production-only integrations (email, malware scanning) degrade to a logged
 *    no-op instead of hard-failing, so every form and upload workflow completes end-to-end.
 *
 * It is disabled by default and is intentionally scoped to presentation/debug concerns ONLY. It
 * NEVER relaxes authentication, RBAC, MFA, restricted-record masking, audit logging, domain
 * transition rules, rate limiting, or the confidential-address protections. The real production
 * path (flag unset) is unchanged: honest empty states and fail-closed integrations.
 */
export function presentationModeEnabled() {
  return process.env.SAFE_NEST_PRESENTATION_MODE === 'true';
}