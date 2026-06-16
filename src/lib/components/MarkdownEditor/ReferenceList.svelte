<script lang="ts">
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import type { ReferenceType } from '$lib/components/Markdown/lib/remark-references'
  import { m } from '$lib/paraglide/messages'
  import type { ReferenceCandidate, ReferenceGroup } from './lib/reference-search.svelte'

  interface Props {
    /** Grouped, filtered candidates (in section order). */
    groups: ReferenceGroup[]
    /** Highlighted candidate, indexed across the flattened list. */
    activeIndex: number
    /** Selection (tap or Enter). */
    onselect: (item: ReferenceCandidate) => void
  }

  let { groups, activeIndex, onselect }: Props = $props()

  const TYPE_ICON: Record<ReferenceType, IconName> = {
    users: 'user',
    areas: 'area',
    blocks: 'block',
    routes: 'route',
  }

  const groupLabel = (type: ReferenceType): string =>
    type === 'users'
      ? m.editor_groupPeople()
      : type === 'areas'
        ? m.editor_groupAreas()
        : type === 'blocks'
          ? m.editor_groupBlocks()
          : m.editor_groupRoutes()

  // Assign each candidate the flat index that `referenceSearch.flat` produces,
  // so keyboard highlighting stays in sync across section boundaries.
  const sections = $derived.by(() => {
    let index = 0
    return groups.map((group) => ({
      type: group.type,
      items: group.items.map((item) => ({ item, index: index++ })),
    }))
  })
</script>

{#if groups.length === 0}
  <p class="text-surface-500 px-3 py-6 text-center text-sm">{m.editor_noMatches()}</p>
{:else}
  <ul class="flex flex-col gap-0.5 p-1">
    {#each sections as section (section.type)}
      <li>
        <p class="text-surface-500 px-2 pt-2 pb-1 text-[11px] font-bold tracking-wide uppercase">
          {groupLabel(section.type)}
        </p>

        <ul class="flex flex-col gap-0.5">
          {#each section.items as { item, index } (item.type + '-' + item.id)}
            <li>
              <Row
                active={index === activeIndex}
                crumbs={item.context}
                onclick={() => onselect(item)}
                title={item.label}
                variant="option"
              >
                <span class="ref-icon bg-surface-200-800 text-surface-700-300">
                  <Icon name={TYPE_ICON[item.type]} size={16} strokeWidth={2.1} />
                </span>
              </Row>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .ref-icon {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
