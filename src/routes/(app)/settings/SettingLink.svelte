<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'

  // A settings-row link: label, optional current value, chevron. Shared by the account rows and
  // the legal list so both stay one row style.
  interface Props {
    href: string
    label: string
    /** The setting's current value, shown muted at the end of the row. */
    value?: string
  }

  const { href, label, value }: Props = $props()
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolve()'d href -->
<a {href} class="hover:bg-surface-100-900 flex items-center justify-between gap-4 p-4">
  <span>{label}</span>

  <span class="flex min-w-0 items-center gap-2">
    {#if value != null}
      <span class="text-surface-600-400 truncate text-sm">{value}</span>
    {/if}
    <Icon name="chevron-right" class="text-surface-400-600" />
  </span>
</a>
