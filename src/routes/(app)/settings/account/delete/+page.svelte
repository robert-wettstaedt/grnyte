<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ReauthStep, { isReauthRequired } from '$lib/auth/ReauthStep.svelte'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { disablePush } from '$lib/state/push.svelte'
  import { wipeAndLeave } from '$lib/state/wipe'
  import { slide } from 'svelte/transition'
  import { accountDeletionPreview, deleteAccountCommand } from '../../account.remote'
  import { deleteAccountSchema } from '../../schemas'

  const store = createFormStore(deleteAccountSchema)
  const preview = remoteResource(accountDeletionPreview())

  const blocks = $derived(preview.data?.blocks ?? [])
  const deletes = $derived(preview.data?.deletes ?? [])
  // Held until the preview answers: the server re-checks the block, but nothing confirms a region that goes.
  const held = $derived(preview.phase.kind !== 'answered' || blocks.length > 0)
  const settled = $derived(preview.phase.kind === 'answered' || preview.phase.kind === 'error')

  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()

  const submit = async (values: z.input<typeof deleteAccountSchema>) => {
    try {
      return await submitCommand(() => deleteAccountCommand(values))
    } catch (cause) {
      if (isReauthRequired(cause)) step?.require()
      throw cause
    }
  }

  const onSubmitted = async () => {
    await disablePush().catch(() => undefined)
    await wipeAndLeave(`${resolve('/')}?accountDeleted`)
  }
</script>

<svelte:head>
  <title>{m.settings_deleteAccount()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet regionList(title: string, regions: { id: number; name: string }[], tone: string)}
  <div class={['card space-y-2 p-4 text-sm', tone]} role="status" transition:slide={{ duration: motion(150) }}>
    <p>{title}</p>
    <ul class="list-inside list-disc font-semibold">
      {#each regions as region (region.id)}
        <li>{region.name}</li>
      {/each}
    </ul>
  </div>
{/snippet}

<Form
  {store}
  {submit}
  cancelTo={resolve('/settings')}
  destructive
  {onSubmitted}
  stayOnSubmit
  submitDisabled={held || !confirmed}
  submitLabel={m.settings_deleteAccountSubmit()}
  title={m.settings_deleteAccount()}
>
  <p class="text-error-700-300 font-semibold">{m.settings_deleteAccountIntro()}</p>

  <section class="space-y-1">
    <h2 class="text-sm font-semibold">{m.settings_deleteAccountGoesTitle()}</h2>
    <p class="text-surface-600-400 text-sm">{m.settings_deleteAccountGoes()}</p>
  </section>

  <section class="space-y-1">
    <h2 class="text-sm font-semibold">{m.settings_deleteAccountStaysTitle()}</h2>
    <p class="text-surface-600-400 text-sm">{m.settings_deleteAccountStays()}</p>
  </section>

  <!-- One action and target on this route, so no {#key} is needed. -->
  <ReauthStep
    bind:this={step}
    bind:confirmed
    action="account.delete"
    target="self"
    ready={settled}
    blocked={blocks.length > 0}
  />

  <!-- Below the step: the regions arrive from a query, and must never push it down. -->
  {#if preview.phase.kind === 'error'}
    <QueryError />
  {/if}
  {#if blocks.length > 0}
    {@render regionList(m.settings_deleteAccountBlockedList(), blocks, 'preset-tonal-error')}
  {/if}
  {#if deletes.length > 0}
    {@render regionList(m.settings_deleteAccountRegionsGone(), deletes, 'preset-tonal-warning')}
  {/if}
</Form>
