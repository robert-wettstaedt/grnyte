<script lang="ts" generics="T extends { id: string | number, name: string, pathname: string }">
  import { draggable, TRIGGER_ELEMENT_CLASS } from '$lib/actions/draggable.svelte'
  import type { Snippet } from 'svelte'
  import { flip } from 'svelte/animate'

  interface Props {
    classes?: string
    listClasses?: string

    items: T[]
    wrap?: boolean

    left: Snippet<[T]>
    leftClasses?: string

    right?: Snippet<[T]>

    children?: Snippet<[T]>

    onConsiderSort?: (items: T[]) => void
    onFinishSort?: (items: T[]) => void
  }

  const {
    classes,
    listClasses,

    items,
    wrap = true,
    left,
    leftClasses = 'anchor',
    right,
    children,

    onConsiderSort,
    onFinishSort,
  }: Props = $props()
</script>

<nav class="list-nav {classes}">
  {#if items.length === 0}
    No items yet
  {:else}
    <ul
      class="overflow-auto"
      use:draggable={onFinishSort == null ? null : items}
      onconsider={(event) => onConsiderSort?.(event.detail)}
      onfinish={(event) => onFinishSort?.(event.detail)}
    >
      {#each items as item (item.id)}
        <li animate:flip={{ duration: 200 }} class={listClasses}>
          <div
            class="hover:preset-tonal-primary flex {wrap
              ? 'flex-wrap'
              : ''} border-surface-800 items-center justify-between rounded whitespace-nowrap"
          >
            {#if onFinishSort != null}
              <i class="fa-solid fa-grip-vertical ml-2 cursor-grab {TRIGGER_ELEMENT_CLASS}"></i>
            {/if}

            <a
              class="
              {leftClasses}
              {wrap ? 'w-full md:w-auto' : 'w-1/2'}
              grow
              overflow-hidden
              px-2
              py-3
              text-ellipsis
              hover:text-white
              md:px-4
            "
              href={item.pathname}
            >
              {@render left(item)}
            </a>

            {#if right != null}
              <div
                class="
              {wrap ? 'w-full' : 'shrink'}
              flex
              overflow-hidden
              text-ellipsis
              md:w-auto
            "
              >
                {@render right(item)}
              </div>
            {/if}
          </div>

          {#if children != null}
            {@render children(item)}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</nav>
