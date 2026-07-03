import { resolve } from '$app/paths'
import type { ResolvedPathname, RouteId } from '$app/types'
import { m } from '$lib/paraglide/messages'

export interface NavItem {
  icon: 'explore' | 'feed' | 'profile'
  label: () => string
  routeId: ResolvedPathname
  /** Route group segment that activates this tab; falls back to matching `routeId`. */
  match?: string
}

export const navItems: NavItem[] = [
  { icon: 'explore', label: m.tab_explore, routeId: resolve('/explore'), match: '(explore)' },
  { icon: 'feed', label: m.tab_feed, routeId: resolve('/(app)/(shell)/feed') },
  { icon: 'profile', label: m.tab_profile, routeId: resolve('/(app)/(shell)/profile') },
]

export function isNavItemActive(item: NavItem, routeId: RouteId | null): boolean {
  if (routeId == null) {
    return false
  }

  return routeId.includes(item.match ?? item.routeId)
}
