<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_REPORT_EMAIL } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { GROUND_LABELS, KIND_LABELS } from '$lib/entities/moderation/mapper'
  import { removalStatement } from '$lib/entities/moderation/moderation.remote'
  import { formatDate } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'

  const statement = $derived(remoteResource(removalStatement(Number(page.params.decisionId))))

  const appeal = (reference: string) =>
    `mailto:${PUBLIC_REPORT_EMAIL}?subject=${encodeURIComponent(m.notices_appealSubject({ reference }))}`
</script>

<svelte:head>
  <title>{m.notices_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/notifications'))} title={m.notices_title()} />

<div class="container mx-auto max-w-xl space-y-6 px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={statement}>
    {#snippet ready(notice)}
      <div class="space-y-6">
        {#if notice.reversedAt != null}
          <p class="card preset-tonal-success p-4 text-sm" role="status">{m.notices_reversed()}</p>
        {/if}

        <p class="text-surface-600-400 text-sm">
          {notice.regionName == null ? m.notices_whereGone() : m.notices_where({ region: notice.regionName })},
          <time datetime={new Date(notice.createdAt).toISOString()}>{formatDate(notice.createdAt, getLocale())}</time>
        </p>

        <section class="space-y-2">
          <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.notices_removed()}</h2>
          <ul class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
            {#each notice.items as item, index (index)}
              <li class="flex items-baseline gap-3 p-4 text-sm">
                <span class="text-surface-600-400 w-20 flex-none text-xs">{KIND_LABELS[item.kind]()}</span>
                <span class="text-surface-950-50 min-w-0 flex-1 break-words">{item.name}</span>
              </li>
            {/each}
          </ul>
        </section>

        <section class="space-y-1">
          <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.notices_ground()}</h2>
          <p class="text-surface-950-50 font-semibold">{GROUND_LABELS[notice.ground]()}</p>
        </section>

        <section class="space-y-1">
          <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.notices_reason()}</h2>
          <blockquote class="border-surface-300-700 border-s-2 ps-3 text-sm break-words whitespace-pre-line">
            {notice.reason}
          </blockquote>
        </section>

        <!-- What a statement of reasons has to say beyond the reason itself (terms clause 12). -->
        <ul class="text-surface-700-300 list-disc space-y-1 ps-5 text-sm">
          <li>
            {notice.ground === 'terms_breach'
              ? m.notices_ruleTerms()
              : notice.ground === 'unlawful'
                ? m.notices_ruleUnlawful()
                : m.notices_rule()}
          </li>
          {#if notice.reversedAt == null}
            <li>{m.notices_noEnd()}</li>
          {/if}
          <li>{m.notices_trigger()}</li>
          <li>{m.notices_automation()}</li>
        </ul>
        <a class="anchor text-sm" href={resolve('/legal/terms')}>{m.notices_terms()}</a>

        <section class="border-surface-200-800 space-y-3 border-t pt-6">
          {#if notice.reversedAt == null}
            <p class="text-surface-700-300 text-sm">{m.notices_appeal()}</p>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a mailto, not an app route -->
            <a class="btn preset-filled w-full md:w-auto" href={appeal(notice.reference)}>
              <Icon name="send" size={16} />
              {m.notices_writeToUs()}
            </a>
          {/if}
          <p class="text-surface-600-400 text-xs">{m.notices_reference({ reference: notice.reference })}</p>
        </section>
      </div>
    {/snippet}
  </QueryState>
</div>
