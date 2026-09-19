<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'

  // A settings row: label, optional current value, and a chevron when it leads somewhere. Shared by
  // the account rows, the legal list and the region screen so all of them stay one row style.
  interface Props {
    /** Omit for a read-only row: renders a plain row with no chevron and no hover. Read-only
     *  rather than a disabled control, because a greyed-out field reads as "temporarily
     *  unavailable" instead of "not yours to change". */
    href?: string
    label: string
    /** The setting's current value, shown muted at the end of the row. */
    value?: string
  }

  const { href, label, value }: Props = $props()
</script>

{#snippet body()}
  <!-- The label yields nothing: any shrink at all wraps it, so the muted value absorbs the whole
       squeeze and wraps instead. The cap is what a `shrink-0` alone would cost, letting a name too
       long for the row wrap inside 70% rather than overflow it. -->
  <span class="max-w-[70%] shrink-0">{label}</span>

  <span class="flex min-w-0 items-center gap-2">
    {#if value != null}
      <!-- `wrap-anywhere`, not `truncate`: the value is meant to wrap, but a string with no break
           opportunity (a long unbroken region name) would otherwise spill past the card. -->
      <span class="text-surface-600-400 text-right text-sm wrap-anywhere">{value}</span>
    {/if}
    {#if href != null}
      <Icon name="chevron-right" class="text-surface-400-600" />
    {/if}
  </span>
{/snippet}

{#if href != null}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolve()'d href -->
  <a {href} class="hover:bg-surface-100-900 flex items-center justify-between gap-4 p-4">
    {@render body()}
  </a>
{:else}
  <div class="flex items-center justify-between gap-4 p-4">
    {@render body()}
  </div>
{/if}
