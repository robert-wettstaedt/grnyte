/** Avatar background gradient for a given oklch hue. */
export function avatarGradient(hue: number): string {
  return `linear-gradient(150deg, oklch(0.68 0.13 ${hue}), oklch(0.46 0.13 ${hue}))`
}
