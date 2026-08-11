<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { slide } from 'svelte/transition'
  import { ENTITY_TYPE_ICON, type EntityCandidate, type EntityGroup } from './search.svelte'

  interface Props {
    /** Highlighted candidate, indexed across the flattened list. */
    activeIndex: number
    /** Grouped, filtered candidates (in section order). */
    groups: EntityGroup[]
    /** Flat index of the first candidate, when rows above this list share the cursor. */
    indexOffset?: number
    /** Selection (tap or Enter). */
    onselect: (item: EntityCandidate) => void
  }

  let { activeIndex, groups, indexOffset = 0, onselect }: Props = $props()

  // Assign each candidate the flat index that `entitySearch.flat` produces,
  // so keyboard highlighting stays in sync across section boundaries.
  const sections = $derived.by(() => {
    let index = indexOffset
    return groups.map((group) => ({
      items: group.items.map((item) => ({ index: index++, item })),
      key: group.key,
      label: group.label,
      onclear: group.onclear,
    }))
  })
</script>

{#if groups.length === 0}
  <p class="text-surface-500 px-3 py-6 text-center text-sm">{m.editor_noMatches()}</p>
{:else}
  <ul class="flex flex-col gap-0.5 p-1">
    {#each sections as section (section.key)}
      <li>
        <div class="flex items-center justify-between px-2 pt-2 pb-1">
          <p class="text-surface-500 text-[11px] font-bold tracking-wide uppercase">{section.label}</p>

          {#if section.onclear != null}
            <button type="button" class="text-surface-500 hover:text-surface-950-50 text-xs" onclick={section.onclear}>
              {m.common_clear()}
            </button>
          {/if}
        </div>

        <ul class="flex flex-col gap-0.5">
          {#each section.items as { index, item } (item.type + '-' + item.id)}
            <!-- No `animate:flip` here: these rows reorder on every keystroke, and one that is
                 still mid-`slide` (height 0) makes flip divide by a zero-height rect and emit
                 NaN/Infinity keyframes. Nothing is lost by dropping it: an `animate:` directive
                 is also what makes Svelte lift a leaving row out of the flow, so without one the
                 slide collapses the row in place and the rows below follow on their own. -->
            <li transition:slide={{ duration: 150 }}>
              <Row
                active={index === activeIndex}
                crumbs={item.context}
                onclick={() => onselect(item)}
                title={item.label}
                variant="option"
              >
                {#if item.type === 'users'}
                  <Avatar name={item.label} />
                {:else}
                  <span class="entity-icon bg-surface-200-800 text-surface-700-300">
                    <Icon name={ENTITY_TYPE_ICON[item.type]} size={16} strokeWidth={2.1} />
                  </span>
                {/if}
              </Row>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .entity-icon {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
