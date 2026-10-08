<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { setBlockLocation, updateBlock } from '$lib/entities/block/blocks.remote'
  import { canEditBlock } from '$lib/entities/block/permissions'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import FormGate from '$lib/forms/FormGate.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { seedForm } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { notifyError } from '$lib/state/toast'

  // Shared body for the two block-editor routes: /edit opens on the form, /move jumps
  // straight to the map picker. Both submit `updateBlock`, so the form must carry the
  // current name + location even on /move, or saving after a pin nudge would wipe them.
  interface Props {
    initialStep?: 'form' | 'pin'
    title: string
  }

  const { initialStep = 'form', title }: Props = $props()

  const global = getGlobalState()
  const block = blockDetail(() => Number(page.params.id))
  // The block's immediate area (last crumb) is the sector the form frames against.
  const area = areaDetail(() => block.data?.areas.at(-1)?.id ?? -1)

  const blockHref = $derived(entityHref('blocks', Number(page.params.id)))

  const denied = $derived(
    block.data == null || canEditBlock(global.userRegions, block.data)
      ? undefined
      : noEditPermission({ href: blockHref, label: m.blocks_viewBlock() }),
  )
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- `whole`: BlockForm seeds its pin at mount, and a submit without coordinates removes the pin. -->
<FormGate
  action={{ label: initialStep === 'pin' ? m.common_done() : m.common_save() }}
  backLabel={initialStep === 'pin' ? title : undefined}
  cancelTo={blockHref}
  {denied}
  fill={initialStep === 'pin'}
  seed={([block]) =>
    void seedForm(updateBlock, { description: block.description, id: String(block.id), name: block.rawName })}
  title={initialStep === 'pin' ? m.blocks_add_setLocationTitle() : title}
  waitFor={[
    { notFound: m.blocks_notFound(), resource: block, whole: true },
    { notFound: m.areas_notFound(), resource: area, whole: false },
  ]}
>
  {#snippet children([detail, area])}
    <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the id changes, so the `<form>`
         it owns is never destroyed and rebuilt under the remote form object, which accepts only one
         element at a time. -->
    <BlockForm
      seedKey={detail.id}
      {area}
      editing
      form={updateBlock}
      {initialStep}
      initialLocation={detail.geolocation == null
        ? null
        : { lat: detail.geolocation.lat, long: detail.geolocation.long }}
      initialEstimated={detail.geolocation?.estimated ?? false}
      cancelTo={blockHref}
      onLocationCommit={initialStep === 'pin'
        ? // Not `withUndo`, so the failure has to be reported here.
          (coords) =>
            void runCommand(setBlockLocation({ id: detail.id, lat: coords.lat, long: coords.long })).catch(notifyError)
        : undefined}
      submitLabel={m.common_save()}
      {title}
    />
  {/snippet}
</FormGate>
