/** The report address, with the reported page's address already in the mail when it is one of ours. */
export function reportMailto(email: string, content: null | string, origin: string): string {
  const address = content == null ? undefined : ownAddress(content, origin)
  return address == null ? `mailto:${email}` : `mailto:${email}?body=${encodeURIComponent(address)}`
}

function ownAddress(content: string, origin: string): string | undefined {
  try {
    const url = new URL(content, origin)
    return url.origin === origin ? url.href : undefined
  } catch {
    return undefined
  }
}
