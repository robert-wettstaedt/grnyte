import type { IconProps } from '@lucide/svelte'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Expand,
  Layers,
  ListFilter,
  LocateFixed,
  Map,
  MapPin,
  Minus,
  Plus,
  Search,
  Shrink,
  Star,
  X,
} from '@lucide/svelte'
import type { Component } from 'svelte'

/**
 * Central registry mapping semantic, library-agnostic icon names to their
 * concrete implementations. This is the single place that knows about the
 * underlying icon library — swapping libraries only requires updating the
 * values here, every call site keeps using `<Icon name="..." />`.
 */
export const icons = {
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  close: X,
  collapse: Shrink,
  expand: Expand,
  filter: ListFilter,
  layers: Layers,
  locate: LocateFixed,
  map: Map,
  'map-pin': MapPin,
  minus: Minus,
  plus: Plus,
  search: Search,
  star: Star,
} satisfies Record<string, Component<IconProps>>

export type IconName = keyof typeof icons
