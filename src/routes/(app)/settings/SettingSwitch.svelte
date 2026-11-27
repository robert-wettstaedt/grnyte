<!--
  A settings row that is a boolean.

  Optimistic and self-reverting: the switch moves immediately, holds until the synced value agrees,
  and moves back with a toast if the write is refused (`createWanted`).
-->
<script lang="ts">
  import { createWanted } from '$lib/state/wanted.svelte'
  import { Switch } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    checked: boolean
    /** Renders the row inert, for a switch whose prerequisite is not met (push not enabled). */
    disabled?: boolean
    /** Explanation under the label, for a switch whose name does not say enough on its own. */
    hint?: string
    label: string
    /** Persists the new value. Throwing puts the switch back. Whatever it resolves with is
     *  ignored, so a remote command can be passed straight through. */
    onchange: (checked: boolean) => Promise<unknown>
  }

  const { checked, disabled = false, hint, label, onchange }: Props = $props()

  const value = createWanted(
    () => checked,
    () => label,
  )
</script>

<!-- The track and the thumb carry no classes of their own: Skeleton already styles every part of
     this switch in its base layer, down to `translateX` on the checked thumb, so a Tailwind
     `translate-x-*` on top of it did not replace that transform, it stacked with it. Same shape
     as the app's other switches (see ShareSheet). -->
<Switch
  checked={value.value}
  {disabled}
  onCheckedChange={(details) => value.set(details.checked, () => onchange(details.checked))}
  class="flex items-center justify-between gap-4 p-4"
>
  <!-- The type is the one thing spelled out: Skeleton's own label is `text-xs font-medium`, which
       would set these rows a size below every link and select row in the same list. A switch row
       is not a smaller kind of setting. -->
  <Switch.Label class="min-w-0 text-base font-normal">
    <span class="block">{label}</span>
    {#if hint != null}
      <span class="text-surface-600-400 mt-0.5 block text-xs">{hint}</span>
    {/if}
  </Switch.Label>

  <Switch.Control class="flex-none" aria-label={label}>
    <Switch.Thumb />
  </Switch.Control>

  <Switch.HiddenInput />
</Switch>
