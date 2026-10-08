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
  import { seedForm, seedOnKeyChange } from '$lib/forms/seed.svelte'
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
      : {
          description: m.form_noEditPermission(),
          primaryAction: { href: blockHref, label: m.blocks_viewBlock() },
          title: m.form_noPermissionTitle(),
        },
  )

  // `settled`, not the raw row: a form opened on a partial snapshot stamps a proof claiming there
  // was no pin, and the seed key (the block id) never changes to re-stamp it, so every save refuses
  // until a reload.
  const settledBlock = $derived(block.settled ? block.data : undefined)

  // Keyed on the hydrated id and not the route parameter or the raw row: the seed reads data, so it
  // has to wait for the row rather than write the previous entity's values under the new id, and it
  // may as well land at the moment the form appears. Re-seeding on every snapshot would clobber
  // edits in progress, which is what the guard is for.
  seedOnKeyChange(
    () => settledBlock?.id,
    () => {
      const data = settledBlock
      if (data == null) {
        return
      }
      void seedForm(updateBlock, { description: data.description, id: String(data.id), name: data.rawName })
    },
  )
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- Outside BlockForm, which seeds its pin at mount: no Save until the pin is here, since a submit
     with no coordinates validly means "remove the pin". The chrome matches the screen it opens on. -->
<FormGate
  action={{ label: initialStep === 'pin' ? m.common_done() : m.common_save() }}
  backLabel={initialStep === 'pin' ? title : undefined}
  cancelTo={blockHref}
  {denied}
  fill={initialStep === 'pin'}
  title={initialStep === 'pin' ? m.blocks_add_setLocationTitle() : title}
  waitFor={[
    { notFound: m.blocks_notFound(), resource: block, whole: true },
    { notFound: m.areas_notFound(), resource: area },
  ]}
>
  {@const detail = block.data!}
  <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the id changes, so the `<form>`
       it owns is never destroyed and rebuilt under the remote form object, which accepts only one
       element at a time. -->
  <BlockForm
    seedKey={detail.id}
    area={area.data!}
    editing
    form={updateBlock}
    {initialStep}
    initialLocation={detail.geolocation == null ? null : { lat: detail.geolocation.lat, long: detail.geolocation.long }}
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
</FormGate>
