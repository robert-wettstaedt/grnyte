<!--
  A settings row that is a boolean.

  Optimistic and self-reverting, the same contract as `SettingSelect`'s callers: the command is
  RLS-gated with no Zero optimism, so the switch moves immediately and moves back if the write is
  refused. Owning the revert here rather than at each call site is the point, since four switches
  hand-rolling the same try/catch is four chances to forget the catch.
-->
<script lang="ts">
  import { notifyError } from '$lib/state/toast'
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

  // Writable derived: the switch moves under the finger rather than waiting for the round trip,
  // and falls back to the synced value whenever that changes, which is how a change made on
  // another device lands here without this component having to notice.
  let value = $derived(checked)

  const onCheckedChange = async (next: boolean) => {
    const previous = value
    value = next

    try {
      await onchange(next)
    } catch {
      value = previous
      notifyError()
    }
  }
</script>

<!-- The track and the thumb carry no classes of their own, which is the whole fix for a thumb
     that used to sit half outside its track: Skeleton already styles every part of this switch in
     its base layer, down to `translateX` on the checked thumb, so a Tailwind `translate-x-*` on
     top of it did not replace that transform, it stacked with it. Same shape as the app's other
     switches (see ShareSheet). -->
<Switch
  checked={value}
  {disabled}
  onCheckedChange={(details) => onCheckedChange(details.checked)}
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
