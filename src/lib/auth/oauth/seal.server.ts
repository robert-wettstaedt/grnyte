import { compactDecrypt, CompactEncrypt } from 'jose'
import { labelledKey } from '../keys.server'

const key = (info: string) => Buffer.from(labelledKey(`seal:${info}`), 'hex')

/** A JWE (`dir`, `A256GCM`) of `value` under a key derived for `info` alone. */
export function seal(info: string, value: unknown): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(key(info))
}

/** Null for anything that does not decrypt under `info`'s key. */
export async function unseal<T>(info: string, sealed: string): Promise<null | T> {
  try {
    const { plaintext } = await compactDecrypt(sealed, key(info), {
      contentEncryptionAlgorithms: ['A256GCM'],
      keyManagementAlgorithms: ['dir'],
    })
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    return null
  }
}
