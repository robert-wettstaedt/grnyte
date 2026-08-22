<!--
  One prose change, behind its own length.

  A component rather than a branch inside `EventChanges`, because each line on a card opens
  and closes on its own and a snippet cannot hold state. The card may hold three edited
  descriptions, and opening one must not open the others.

  It was a `<details>`, which gave the semantics for free and nothing else: the summary was a
  16px target with no padding, and the panel could not be animated. `::details-content` itself is
  everywhere now (Chrome 131, Safari 18.4, Firefox 143), but animating it is not: a symmetric
  open and close needs `interpolate-size: allow-keywords`, which is Chrome only, and the fallback
  of transitioning `content-visibility` discretely is missing in Firefox. So this is the same
  button-and-slide disclosure the card's own change list uses, which also puts the reader on one
  idiom rather than two that behave differently.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ChangeView } from '$lib/entities/event/change'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'

  interface Props {
    /** The prose arm of a change view: the two texts, and the word diff when both exist. */
    change: Extract<ChangeView, { kind: 'prose' }>
  }

  const { change }: Props = $props()

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  let open = $state(false)

  /** The two halves of a prose diff. Named so each element fits on one line: the paragraph
   *  around them preserves whitespace, so a wrapped tag would leak its indentation into the
   *  sentence. The margin sits on the removed half alone, because `diffWords` hands back a
   *  replaced word and its replacement with nothing between them while every other boundary
   *  already carries the space it had in the text. */
  const ADDED_WORDS = 'bg-success-500/25 text-surface-950-50 rounded-sm px-0.5 no-underline'
  const REMOVED_WORDS = 'text-surface-600-400/70 mr-0.5 decoration-1'
</script>

<div class="min-w-0">
  <!-- The tap target is grown by a pseudo-element rather than by padding, the same way the
       card's own two disclosures are: this sits in a change line beside a label and an icon,
       and real padding would space the lines apart to make room for a control that is only
       there on the prose ones. -->
  <button
    type="button"
    class="text-surface-600-400 hover:text-surface-950-50 relative flex items-center gap-1 text-xs before:absolute before:inset-x-0 before:-inset-y-3.5"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
    {m.event_compareCharacters({ count: (change.after ?? '').length })}
  </button>

  {#if open}
    <!-- One merged text when both sides have one, so the edit points at itself instead of
         leaving the reader to compare two near-identical paragraphs. Source rather than
         rendered markdown: see `proseDiff`. -->
    <div class="mt-1.5 text-xs" transition:slide={{ duration }}>
      {#if change.segments != null}
        <!-- No whitespace between a tag and its text: the paragraph preserves what it is
             given, so an indented `{segment.value}` would put the markup's own newlines
             inside the sentence. The classes are named above for the same reason, to keep
             each element on one line. -->
        <p class="text-surface-600-400 whitespace-pre-wrap">
          {#each change.segments as segment, index (index)}
            {#if segment.kind === 'added'}
              <ins class={ADDED_WORDS}>{segment.value}</ins>
            {:else if segment.kind === 'removed'}
              <del class={REMOVED_WORDS}>{segment.value}</del>
            {:else}{segment.value}{/if}
          {/each}
        </p>
      {:else}
        <!-- Filled from nothing, or cleared. "Not set" against the text is the whole story,
             and a diff of it would be one long stripe of a single colour. -->
        <div class="space-y-1.5">
          <div class="text-surface-600-400 line-through">
            {#if change.before}
              <p class="whitespace-pre-wrap">{change.before}</p>
            {:else}
              <p>{m.event_valueNotSet()}</p>
            {/if}
          </div>
          <div class="text-surface-950-50">
            {#if change.after}
              <p class="whitespace-pre-wrap">{change.after}</p>
            {:else}
              <p>{m.event_valueNotSet()}</p>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
