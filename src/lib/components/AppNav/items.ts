import { resolve } from '$app/paths'
import type { ResolvedPathname, RouteId } from '$app/types'
import { m } from '$lib/paraglide/messages'

export interface NavItem {
  icon: 'explore' | 'feed' | 'profile'
  label: () => string
  /** Route group segment that activates this tab; falls back to matching `routeId`. */
  match?: string
  routeId: ResolvedPathname
}

export const navItems: NavItem[] = [
  { icon: 'explore', label: m.tab_explore, match: '(explore)', routeId: resolve('/explore') },
  { icon: 'feed', label: m.tab_feed, routeId: resolve('/(app)/(shell)/feed') },
  { icon: 'profile', label: m.tab_profile, routeId: resolve('/(app)/(shell)/profile') },
]

export function isNavItemActive(item: NavItem, routeId: null | RouteId): boolean {
  if (routeId == null) {
    return false
  }

  return routeId.includes(item.match ?? item.routeId)
}
