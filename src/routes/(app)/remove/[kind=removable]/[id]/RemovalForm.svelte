<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { deleteArea } from '$lib/entities/area/writes'
  import { deleteAscent } from '$lib/entities/ascent/writes'
  import { deleteBlock } from '$lib/entities/block/writes'
  import { deleteFile } from '$lib/entities/file/writes'
  import {
    goneForGood,
    REASON_MAX,
    removalSchema,
    type ModerationGround,
    type RemovableKind,
    type RemovalInput,
    type RemovalPreview,
  } from '$lib/entities/moderation/dto'
  import GroundField from '$lib/entities/moderation/GroundField.svelte'
  import ItemCard from '$lib/entities/moderation/ItemCard.svelte'
  import { removalPreview } from '$lib/entities/moderation/moderation.remote'
  import { undoRemoval } from '$lib/entities/moderation/writes'
  import { deleteComment } from '$lib/entities/reaction/writes'
  import { deleteRoute } from '$lib/entities/route/writes'
  import { deleteTopo } from '$lib/entities/topo/writes'
  import FieldWrapper from '$lib/forms/FieldWrapper.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { isAuthoredMessage, resolveIssueMessage, serverMessage } from '$lib/forms/issue'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back, exit } from '$lib/state/navigation.svelte'
  import { notifyUndo, toaster } from '$lib/state/toast'

  interface Props {
    /** Preselected, from a report; the reason stays the admin's own. */
    ground?: ModerationGround
    id: string
    kind: RemovableKind
    /** Where to land once removed, when that is not the item's home: the reports queue. */
    returnTo?: string
  }

  const { ground, id, kind, returnTo }: Props = $props()

  const store = createFormStore(removalSchema)
  const query = $derived(removalPreview({ id, kind }))
  const preview = $derived(remoteResource(query))
  // A refusal the server wrote (gone already, nothing of anyone else's) reads as itself, not as a failure.
  const refusal = $derived.by(() => {
    const raw = query.error == null ? undefined : serverMessage(query.error)
    return raw != null && isAuthoredMessage(raw) ? raw : undefined
  })
  const waited = {
    get data() {
      return preview.data == null ? undefined : { ...preview.data, id }
    },
    get phase() {
      return preview.phase
    },
  }
  const waitFor = [{ notFound: m.moderation_notFound(), resource: waited, whole: false }] as const

  // Taken at submit: the delete leaves this page, and the params then no longer name what went.
  let removed: undefined | { id: string; kind: RemovableKind }

  const submit = (values: RemovalInput) => {
    removed = { id, kind }
    const parentFk = preview.data?.item.parentFk ?? null
    const n = Number(id)
    switch (kind) {
      case 'area':
        return deleteArea({ id: n, parentFk }, values)
      case 'ascent':
        return deleteAscent(n, values)
      case 'block':
        return deleteBlock({ areaFk: parentFk ?? 0, id: n }, values)
      case 'comment':
        return deleteComment(n, values)
      case 'file':
        return deleteFile(id, values)
      case 'route':
        return deleteRoute({ blockFk: parentFk ?? 0, id: n }, values)
      case 'topo':
        return deleteTopo(n, values)
    }
  }

  const onSubmitted = async () => {
    const target = removed
    if (target != null && !goneForGood(target.kind)) {
      notifyUndo({ message: m.moderation_removed(), onUndo: () => undoRemoval(target.kind, target.id) })
    } else {
      toaster.create({ title: m.moderation_removed(), type: 'success' })
    }
    if (returnTo != null) await exit(returnTo)
  }

  const told = ({ names, others }: Pick<RemovalPreview, 'names' | 'others'>) =>
    names.length === 0
      ? m.moderation_toldNobody()
      : others === 0
        ? m.moderation_toldOne({ name: names[0] })
        : m.moderation_toldMany({ count: others, name: names[0] })
</script>

<svelte:head>
  <title>{m.moderation_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if refusal != null}
  <PageHeader onback={() => back(resolve('/feed'))} title={m.moderation_title()} />
  <div class="container mx-auto max-w-xl px-4 py-8">
    <p class="card preset-tonal-warning p-4 text-sm" role="status">{resolveIssueMessage(refusal)}</p>
  </div>
{:else}
  <Form
    cancelTo={preview.data?.item.home ?? resolve('/feed')}
    destructive
    {onSubmitted}
    stayOnSubmit={returnTo != null}
    seed={() => (ground == null ? {} : { ground })}
    {store}
    {submit}
    submitLabel={m.moderation_submit()}
    title={m.moderation_title()}
    {waitFor}
  >
    {#snippet fields([{ item, ...people }])}
      <ItemCard {item} {kind} />

      <GroundField field={store.fields.ground} id="removal-ground" legend={m.moderation_ground()} />

      <FieldWrapper
        field={store.fields.reason}
        hint={store.fields.ground.value() === 'terms_breach'
          ? m.moderation_reasonHintTerms()
          : m.moderation_reasonHint()}
        id="removal-reason"
        label={m.moderation_reason()}
        required
      >
        {#snippet children(props)}
          <textarea
            {...store.fields.reason.as('text')}
            {...props}
            class="textarea"
            maxlength={REASON_MAX}
            rows="5"
          ></textarea>
        {/snippet}
      </FieldWrapper>

      <p class="text-surface-700-300 text-sm" role="status">{told(people)}</p>
    {/snippet}
  </Form>
{/if}
