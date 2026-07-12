<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { deleteAscent, updateAscent } from '$lib/entities/ascent/ascents.remote'
  import { canEditAscent } from '$lib/entities/ascent/permissions'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()
  const ascent = ascentDetail(() => Number(page.params.id))
  // The route and its block frame the form (context card, breadcrumb, mentions region).
  const route = routeDetail(() => ascent.data?.routeFk ?? -1)
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  // Only read from the ready snippet, where the ascent is loaded (`-1` is the
  // established while-loading idiom).
  const routeHref = $derived(resolve('/(app)/routes/[id]', { id: String(ascent.data?.routeFk ?? -1) }))

  // Prefill once per ascent; the custom inputs seed themselves from the `ascent` prop,
  // this covers the field-driven ones (notes). Reading live data on every change would
  // clobber the user's edits (same rule as the route edit page).
  let prefilledId: number | undefined
  $effect(() => {
    const data = ascent.data
    if (data != null && data.id !== prefilledId) {
      prefilledId = data.id
      updateAscent.fields.set({
        id: String(data.id),
        notes: data.notes,
        routeId: String(data.routeFk),
        type: data.type,
      })
    }
  })

  const onSubmitted = async () => {
    if (updateAscent.result?.data?.id == null) return
    await goto(routeHref)
  }

  const onDelete = async () => {
    const data = ascent.data
    if (data == null) return
    // Captured before the delete: once the removal syncs, ascent.data (and with it
    // routeHref) goes away.
    const href = routeHref
    await deleteAscent({ id: data.id })
    toaster.create({ type: 'info', title: m.ascents_deleted() })
    await goto(href)
  }
</script>

<svelte:head>
  <title>{m.ascents_editAscent()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={ascent}>
  {#snippet ready(detail)}
    <QueryState resource={route}>
      {#snippet ready(routeData)}
        <QueryState resource={block}>
          {#snippet ready(blockData)}
            {#if canEditAscent(global.userRegions, global.user?.id, detail)}
              <Form
                form={updateAscent}
                onCancel={() => back(routeHref)}
                {onSubmitted}
                submitLabel={m.common_save()}
                title={m.ascents_editAscent()}
              >
                <AscentFormFields ascent={detail} block={blockData} form={updateAscent} route={routeData} />

                <!-- Danger zone: deleting takes the attached media with it, so it
                     confirms instead of offering undo (the media can't come back). -->
                <div class="border-surface-200-800 border-t pt-5">
                  <Dialog title={m.ascents_delete()} saveText={m.ascents_delete()} onsave={onDelete}>
                    {#snippet trigger()}
                      <span class="btn preset-tonal-error w-full">
                        <Icon name="trash" size={16} />
                        {m.ascents_delete()}
                      </span>
                    {/snippet}
                    {#snippet content()}
                      {m.ascents_deleteConfirm({ name: routeData.name })}
                    {/snippet}
                  </Dialog>
                </div>
              </Form>
            {:else}
              <ErrorState type="notfound" title={m.ascents_notFound()} />
            {/if}
          {/snippet}
        </QueryState>
      {/snippet}
    </QueryState>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.ascents_notFound()} />
  {/snippet}
</QueryState>
