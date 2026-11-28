<script lang="ts">
  import Banner from '$lib/components/Banner/Banner.svelte'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import { m } from '$lib/paraglide/messages'
  import type { Refusal } from '$lib/powersync/queue'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'

  // Writes queued on this device that the server refused after their form had finished. Each stays until
  // dismissed, so a refusal that arrived while the app was closed is still seen.
  interface Props {
    ondismiss: (id: string) => unknown
    refusals: readonly Refusal[]
  }

  const { ondismiss, refusals }: Props = $props()
</script>

{#if refusals.length > 0}
  <div class="flex flex-col gap-2 px-3 pt-2" transition:slide={{ duration: motion(150) }}>
    {#each refusals as refusal (refusal.id)}
      <div transition:slide={{ duration: motion(150) }}>
        <Banner tone="error">
          <span class="font-semibold">{m.queued_refusedTitle()}</span>
          <span>{refusal.message == null ? m.error_generic_title() : resolveIssueMessage(refusal.message)}</span>
          <span class="flex gap-2 pt-1">
            {#if refusal.href != null}
              <!-- eslint-disable svelte/no-navigation-without-resolve -- the entry's own form path plus a query -->
              <a class="btn btn-sm preset-filled-surface-950-50" href="{refusal.href}?restore={refusal.id}">
                {m.queued_open()}
              </a>
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/if}
            <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => ondismiss(refusal.id)}>
              {m.queued_dismiss()}
            </button>
          </span>
        </Banner>
      </div>
    {/each}
  </div>
{/if}
