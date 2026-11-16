import { dev } from '$app/environment'
import commonPasswords from './common-passwords.txt?raw'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 1500

// SecLists' `10k-most-common.txt` (MIT), lowercased: the fallback while the range service is out.
const common = new Set(commonPasswords.split('\n').filter(Boolean))

/**
 * A breached or common password is refused. Only a SHA-1 prefix leaves the
 * server; when the range service is slow or down, the bundled list decides instead.
 */
export async function checkPassword(password: string): Promise<'breached' | 'ok'> {
  // Off on the dev server so local test accounts can use simple passwords; every build checks.
  if (dev) return 'ok'
  const digest = Buffer.from(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password)))
    .toString('hex')
    .toUpperCase()
  try {
    const response = await fetch(`${RANGE_URL}${digest.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`range answered ${response.status}`)
    const suffix = digest.slice(5)
    // Padding rows carry a count of 0.
    const hit = (await response.text())
      .split('\n')
      .some((line) => line.startsWith(`${suffix}:`) && Number.parseInt(line.slice(36), 10) > 0)
    return hit ? 'breached' : 'ok'
  } catch {
    return common.has(password.toLowerCase()) ? 'breached' : 'ok'
  }
}
