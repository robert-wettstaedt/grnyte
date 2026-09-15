<script module lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import SettingSwitch from './SettingSwitch.svelte'

  // Titled under the screen it belongs to, not under Components: this row is a piece of the
  // settings page and lives in the route, not in $lib.
  const { Story } = defineMeta({
    args: {
      label: m.settings_push(),
      // Every story needs a persist function. The default one succeeds instantly, so the switch
      // stays where it was put; the "Reverts on failure" story below swaps in one that throws.
      onchange: async () => {},
    },
    component: SettingSwitch,
    // 360px is a phone column, the width these rows are actually read at, and the width that
    // makes a wrapping label or hint visible instead of hiding it behind a wide canvas.
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Settings/SettingSwitch',
  })

  // The notification block of the settings page, verbatim: six rows in one bordered, divided
  // container. The row's own padding is what sets the rhythm here, so this is the story that
  // catches a change to it.
  const notificationRows = [
    { checked: true, hint: m.settings_notifyDirectedHint(), label: m.settings_notifyDirected() },
    { checked: true, hint: m.settings_notifyReactionsHint(), label: m.settings_notifyReactions() },
    { checked: false, hint: m.settings_notifyCommentsHint(), label: m.settings_notifyComments() },
    { checked: true, hint: m.settings_notifyAscentsHint(), label: m.settings_notifyAscents() },
    { checked: false, hint: m.settings_notifyGuidebookEditsHint(), label: m.settings_notifyGuidebookEdits() },
    { checked: true, hint: m.settings_notifyCommunityHint(), label: m.settings_notifyCommunity() },
  ]

  const persist = async () => {}

  // Refused write: the switch moves under the finger, then falls back and raises an error toast
  // (no toaster is mounted in Storybook, so only the revert is visible).
  const refuse = async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    throw new Error('Story: the write was refused')
  }
</script>

{#snippet group()}
  <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
    {#each notificationRows as row (row.label)}
      <SettingSwitch checked={row.checked} hint={row.hint} label={row.label} onchange={persist} />
    {/each}
  </div>
{/snippet}

{#snippet disabledRows()}
  <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
    <SettingSwitch checked={false} disabled label={m.settings_push()} onchange={persist} />
    <SettingSwitch checked disabled label={m.settings_push()} onchange={persist} />
  </div>
{/snippet}

<!-- Off, the plain row: label on the left, track on the right, no second line. -->
<Story name="Off" args={{ checked: false }} />

<!-- On: the filled track and the thumb at its checked offset, both from Skeleton's base layer. -->
<Story name="On" args={{ checked: true }} />

<!-- With a hint, the two-line row: the label stays at body size and the hint sits under it. -->
<Story
  name="With hint"
  args={{ checked: true, hint: m.settings_notifyDirectedHint(), label: m.settings_notifyDirected() }}
/>

<!-- Both disabled states side by side, the shape a switch takes when its prerequisite
     is missing (push permission not granted). -->
<Story name="Disabled" template={disabledRows} />

<!-- A label and hint long enough to wrap at phone width: the text column must give way and
     the track must keep its size rather than being squeezed. -->
<Story
  name="Wrapping label"
  args={{
    checked: false,
    hint: m.settings_notifyGuidebookEditsHint(),
    label: `${m.settings_notifyGuidebookEdits()} ${m.settings_notifyCommunityHint()}`,
  }}
/>

<!-- The real settings block: six rows stacked in one bordered container, which is where row
     padding, divider spacing and label size have to agree with each other. -->
<Story name="Notification group" template={group} />

<!-- Toggle it: the switch moves immediately, then falls back after the write is refused. -->
<Story name="Reverts on failure" args={{ checked: false, onchange: refuse }} />
