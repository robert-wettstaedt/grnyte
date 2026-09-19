<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ProfileStats } from '$lib/entities/ascent/stats'
  import { m } from '$lib/paraglide/messages'

  // Avatar + username (+ first-ascentionist name) + headline stats.
  interface Props {
    /** Guidebook contributions (areas/blocks/routes touched); undefined while loading. */
    contributions: number | undefined
    /** First-ascentionist display name(s), empty when the user has none. */
    faName: string
    /** Hardest sent grade, already labelled for the active grading scale. */
    hardestGrade: string
    /** Own profile: shows the settings cog in the corner. */
    isSelf: boolean
    /** When set (public profile), shows a back button mirroring the settings cog. */
    onBack?: () => void
    stats: ProfileStats
    /**
     * The ascents these stats are derived from are not available right now: offline, and either not
     * kept for this person or never synced to this device. A count is then a claim we cannot make.
     * "0 ascents" reads as "they have never climbed", which is the one thing a gap must never say.
     */
    unavailable?: boolean
    username: string
  }

  const { contributions, faName, hardestGrade, isSelf, onBack, stats, unavailable, username }: Props = $props()

  /** The shared empty glyph `hardestGrade` and `contributions` already fall back to. */
  const EMPTY = '—'

  // Compact counts so a large tally stays one glyph wide (1100 -> "1.1K"). Forced to `en` because
  // German compact notation abbreviates nothing below a million: 1100 stays "1100" and 11000 becomes
  // "11.000", where `en` gives "1.1K" and "11K". Ascents, sends and follower counts are three or
  // four digits, so that is the whole range these live in. German does abbreviate from a million up
  // ("1,2 Mio."), so revisit this if a counter ever gets there.
  const compact = new Intl.NumberFormat('en', { maximumFractionDigits: 1, notation: 'compact' })
</script>

<header class="relative flex flex-col items-center gap-4 text-center">
  {#if onBack != null}
    <button
      type="button"
      class="btn-icon preset-filled-surface-200-800 absolute top-0 left-0"
      title={m.common_back()}
      aria-label={m.common_back()}
      onclick={onBack}
    >
      <Icon name="arrow-left" />
    </button>
  {/if}
  {#if isSelf}
    <a
      href={resolve('/settings')}
      class="btn-icon preset-filled-surface-200-800 absolute top-0 right-0"
      title={m.settings_title()}
      aria-label={m.settings_title()}
    >
      <Icon name="settings" />
    </a>
  {/if}
  <Avatar name={username} size={80} solid loading={username === ''} />
  <div>
    <h1 class="h3 font-bold">{username}</h1>
    {#if faName !== ''}
      <p class="text-surface-600-400 text-sm">{faName}</p>
    {/if}
  </div>

  <dl class="flex items-stretch gap-6">
    <div class="flex flex-col">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_sends()}</dt>
      <dd class="text-2xl font-bold tabular-nums">{unavailable ? EMPTY : compact.format(stats.sends)}</dd>
    </div>
    <div class="border-surface-200-800 flex flex-col border-x px-6">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_hardest()}</dt>
      <!-- gradeLabel already yields the shared empty glyph when nothing is sent (hardestGradeFk undefined). -->
      <dd class="text-2xl font-bold tabular-nums">{unavailable ? EMPTY : hardestGrade}</dd>
    </div>
    <div class="flex flex-col">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_contributions()}</dt>
      <dd class="text-2xl font-bold tabular-nums">{contributions == null ? '—' : compact.format(contributions)}</dd>
    </div>
  </dl>
</header>
