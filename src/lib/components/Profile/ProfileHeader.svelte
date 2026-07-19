<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import type { ProfileStats } from '$lib/entities/ascent/stats'
  import { m } from '$lib/paraglide/messages'

  // Avatar + username (+ first-ascentionist name) + headline stats.
  interface Props {
    /** Crag-database contributions (areas/blocks/routes touched); undefined while loading. */
    contributions: number | undefined
    /** First-ascentionist display name(s), empty when the user has none. */
    faName: string
    /** Hardest sent grade, already labelled for the active grading scale. */
    hardestGrade: string
    stats: ProfileStats
    username: string
  }

  const { contributions, faName, hardestGrade, stats, username }: Props = $props()

  // Compact counts so a large tally stays one glyph wide (1100 -> "1.1K"). Forced to
  // `en` because German compact notation doesn't abbreviate thousands; we always want "K".
  const compact = new Intl.NumberFormat('en', { maximumFractionDigits: 1, notation: 'compact' })
</script>

<header class="flex flex-col items-center gap-4 text-center">
  <Avatar name={username} size={80} solid loading={username === ''} />
  <div>
    <h1 class="h3 font-bold">{username}</h1>
    {#if faName !== ''}
      <p class="text-surface-500 text-sm">{faName}</p>
    {/if}
  </div>

  <dl class="flex items-stretch gap-6">
    <div class="flex flex-col">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_sends()}</dt>
      <dd class="text-2xl font-bold tabular-nums">{compact.format(stats.sends)}</dd>
    </div>
    <div class="border-surface-200-800 flex flex-col border-x px-6">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_hardest()}</dt>
      <!-- gradeLabel already yields the shared empty glyph when nothing is sent (hardestGradeFk undefined). -->
      <dd class="text-2xl font-bold tabular-nums">{hardestGrade}</dd>
    </div>
    <div class="flex flex-col">
      <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{m.profile_contributions()}</dt>
      <dd class="text-2xl font-bold tabular-nums">{contributions == null ? '—' : compact.format(contributions)}</dd>
    </div>
  </dl>
</header>
