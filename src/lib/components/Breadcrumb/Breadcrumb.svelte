<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'

  interface Props {
    url: URL
  }

  let { url }: Props = $props()

  interface Crumb {
    href: string
    label: string
  }

  let breadcrumbRef: HTMLElement | null = $state(null)
  let isOverflowing = $state(false)
  let showOverflow = $state(false)

  let crumbs: Crumb[] = $derived.by(() => {
    // Remove zero-length tokens.
    const tokens = url.pathname.split('/').filter((token) => token !== '')

    // Create { label, href } pairs for each token.
    let tokenPath = ''
    const crumbs = tokens
      .map((token): Crumb => {
        tokenPath += '/' + token
        return {
          label: token,
          href: tokenPath,
        }
      })
      .filter((crumb) => crumb.label !== '_')

    // Add a way to get home too.
    crumbs.unshift({ label: 'home', href: '/' })

    return crumbs
  })

  const onToggleOverflow = () => {
    showOverflow = !showOverflow

    requestAnimationFrame(() => {
      updateOverflow()
    })
  }

  const updateOverflow = () => {
    if (breadcrumbRef == null) {
      isOverflowing = false
      return
    }

    isOverflowing = breadcrumbRef.scrollWidth > breadcrumbRef.clientWidth
    breadcrumbRef.scrollTo({ left: breadcrumbRef.scrollWidth + crumbs.length, behavior: 'auto' })
  }

  $effect(() => {
    updateOverflow()
  })

  afterNavigate(() => {
    showOverflow = false
  })
</script>

<svelte:window onresize={updateOverflow} />

{#if crumbs.length > 2}
  <div class="relative mb-4 md:mb-8">
    {#if isOverflowing && !showOverflow}
      <span class="absolute left-0 top-0 bg-surface-50-950 pr-1">...</span>
    {/if}

    <ol
      bind:this={breadcrumbRef}
      class="flex {showOverflow ? 'flex-wrap' : ''} mr-9 items-center gap-2 md:gap-4 overflow-hidden whitespace-nowrap"
    >
      {#each crumbs as crumb, i}
        <li>
          <a class="anchor" href={crumb.href}>{crumb.label}</a>
        </li>

        {#if i < crumbs.length - 1}
          <li class="opacity-50" aria-hidden="true">/</li>
        {/if}
      {/each}
    </ol>

    {#if isOverflowing || showOverflow}
      <button
        aria-label={showOverflow ? 'Show less' : 'Show more'}
        class="btn-icon absolute right-0 -top-1"
        onclick={onToggleOverflow}
      >
        <i class="fa-solid {showOverflow ? 'fa-caret-up' : 'fa-caret-down'}"></i>
      </button>
    {/if}
  </div>
{/if}
