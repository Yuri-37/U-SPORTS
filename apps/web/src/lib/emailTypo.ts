/**
 * Catches a mistyped school email domain before a reset is requested.
 *
 * A reset request for an address with no account still "succeeds" (on
 * purpose: otherwise the form would reveal who has an account), so a typo such
 * as `@sudents.nu-dasma.edu.ph` silently sends nothing and looks exactly like a
 * slow email. When the domain is a near-miss of a school domain, offer the
 * corrected address instead of sending.
 */
const SCHOOL_DOMAINS = ['students.nu-dasma.edu.ph', 'nu-dasma.edu.ph']

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

/** The corrected address, or null when the domain is fine or nowhere near a school one. */
export function suggestSchoolEmail(email: string): string | null {
  const at = email.trim().lastIndexOf('@')
  if (at < 1) return null
  const local = email.trim().slice(0, at)
  const domain = email.trim().slice(at + 1).toLowerCase()
  if (SCHOOL_DOMAINS.includes(domain)) return null
  let best: { domain: string; d: number } | null = null
  for (const d of SCHOOL_DOMAINS) {
    const dist = editDistance(domain, d)
    if (dist <= 3 && (!best || dist < best.d)) best = { domain: d, d: dist }
  }
  return best ? `${local}@${best.domain}` : null
}
