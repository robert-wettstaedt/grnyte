import { labelledKey } from '$lib/auth/keys.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { sql } from 'drizzle-orm'
import { createHmac } from 'node:crypto'

/** How `apple_mail_forwarding` stores an address: zero-cache's replica copy holds no address. */
export const addressHash = (address: string): string =>
  createHmac('sha256', labelledKey('apple-mail-forwarding')).update(address.toLowerCase()).digest('hex')

/**
 * The addresses, of those given, that Apple no longer forwards. Callers pass current addresses, so a moved account
 * drops out. Fails open (none) when the lookup fails: a lost lookup must not stop mail or a screen.
 */
export async function notForwarding(addresses: string[]): Promise<Set<string>> {
  const byHash = new Map(addresses.map((address) => [addressHash(address), address]))
  if (byHash.size === 0) return new Set()
  try {
    const rows = await pinnedTx((tx) =>
      tx.execute<{ address_hash: string }>(sql`
        select address_hash from public.apple_mail_forwarding
        where not forwarding and address_hash in ${[...byHash.keys()]}`),
    )
    return new Set(rows.map((row) => byHash.get(row.address_hash) as string))
  } catch (cause) {
    console.warn('[mail-forwarding] lookup failed, treating every address as forwarding', cause)
    return new Set()
  }
}
