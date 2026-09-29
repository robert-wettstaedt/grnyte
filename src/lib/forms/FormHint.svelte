<script lang="ts">
  import { motion } from '$lib/state/motion.svelte'
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { slide } from 'svelte/transition'
  import { resolveIssueMessage } from './issue'
  import { isSeeding } from './seed.svelte'

  interface Props {
    hint?: string
    id?: null | string
    issues?: RemoteFormIssue[]
  }

  let { hint, id, issues = [] }: Props = $props()

  // No slide while a seed hides the last open's issues: sliding out would keep them on screen.
  const duration = $derived(motion(150))
</script>

<!-- One container for all issues: `aria-errormessage` points at this id, only one element may carry it.
     Slides in because a failed submit adds it under a field the reader is already looking at. -->
{#if issues.length > 0}
  <div
    id={id == null ? undefined : `${id}-error`}
    role="alert"
    transition:slide={{ duration: isSeeding() ? 0 : duration }}
  >
    {#each issues as issue, i (i)}
      <p class="text-error-500 text-sm opacity-80">
        {resolveIssueMessage(issue.message)}
      </p>
    {/each}
  </div>
{/if}

<!-- Alongside the error, not instead of it: the hint is the instruction, needed most when the field fails. -->
{#if hint != null}
  <div id={id == null ? undefined : `${id}-hint`}>
    <p class="text-surface-600-400 text-sm">{hint}</p>
  </div>
{/if}
