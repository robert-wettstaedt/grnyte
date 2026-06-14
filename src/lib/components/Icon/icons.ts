import type { IconProps } from '@lucide/svelte'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Expand,
  FileText,
  ImageOff,
  Layers,
  List,
  ListFilter,
  LocateFixed,
  Map,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shrink,
  SquareParking,
  SquarePen,
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
  'arrow-right': ArrowRight,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  close: X,
  collapse: Shrink,
  edit: SquarePen,
  expand: Expand,
  'file-text': FileText,
  filter: ListFilter,
  'image-off': ImageOff,
  layers: Layers,
  list: List,
  locate: LocateFixed,
  map: Map,
  'map-pin': MapPin,
  minus: Minus,
  parking: SquareParking,
  plus: Plus,
  search: Search,
  share: Share2,
  star: Star,
  sync: RefreshCw,
} satisfies Record<string, Component<IconProps>>

export type IconName = keyof typeof icons
