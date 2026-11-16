<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ReauthStep, { withReauth } from '$lib/auth/ReauthStep.svelte'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { entityHref } from '$lib/entities/href'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { motion } from '$lib/state/motion.svelte'
  import { disablePush } from '$lib/state/push.svelte'
  import { setLeaving, wipeAndLeave } from '$lib/state/wipe'
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
  const owned = $derived(
    new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(blocks.map((region) => region.name)),
  )

  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()

  const submit = async (values: z.input<typeof deleteAccountSchema>) => {
    // Before the command: Zero can drop the user row before the answer lands, and the layout would bounce.
    setLeaving(true)
    try {
      return await withReauth(step, () => submitCommand(() => deleteAccountCommand(values)))
    } catch (cause) {
      setLeaving(false)
      throw cause
    }
  }

  const onSubmitted = async () => {
    await disablePush().catch(() => undefined)
    await wipeAndLeave(`${resolve('/')}?accountDeleted`)
  }

  const muted = 'text-surface-600-400 text-[14.5px] leading-normal'
</script>

<svelte:head>
  <title>{m.settings_deleteAccount()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  {store}
  {submit}
  cancelTo={resolve('/settings')}
  destructive
  {onSubmitted}
  stayOnSubmit
  submitDisabled={held || !confirmed}
  submitLabel={m.common_delete()}
  title={m.settings_deleteAccount()}
>
  <p class={muted}>{m.settings_deleteAccountIntro()}</p>

  <section class="space-y-1">
    <h2 class="text-sm font-semibold">{m.settings_deleteAccountGoesTitle()}</h2>
    <p class="text-surface-600-400 text-sm">{m.settings_deleteAccountGoes()}</p>
  </section>

  <section class="space-y-1">
    <h2 class="text-sm font-semibold">{m.settings_deleteAccountStaysTitle()}</h2>
    <p class="text-surface-600-400 text-sm">{m.settings_deleteAccountStays()}</p>
  </section>

  <!-- Blocked: each owned region with a way to hand it over, and no code to ask for. -->
  {#if blocks.length > 0}
    <div
      class="border-error-500/35 bg-error-500/10 flex flex-col gap-2.5 rounded-2xl border p-4"
      role="alert"
      transition:slide={{ duration: motion(150) }}
    >
      <p class="text-[15px] font-bold">{m.settings_deleteAccountBlockedTitle()}</p>
      <p class={muted}>{m.settings_deleteAccountBlockedBody({ count: blocks.length, regions: owned })}</p>
      <ul>
        {#each blocks as region (region.id)}
          <li
            class="border-surface-200-800 flex items-center justify-between gap-3 border-t py-3 text-[14.5px] font-semibold"
          >
            <span>{region.name}</span>
            <a href={entityHref('regions', region.id)} class="text-primary-600-400 py-1.5 text-[13.5px] font-bold">
              {m.region_handOverAction()}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <!-- One action and target on this route, so no {#key} is needed. -->
    <ReauthStep
      bind:this={step}
      bind:confirmed
      action="account.delete"
      email={page.data.session?.user.email ?? ''}
      next={m.settings_deleteAccountNext()}
      target="self"
      ready={settled}
    />
  {/if}

  <!-- Below the step: the regions arrive from a query, and must never push it down. -->
  {#if preview.phase.kind === 'error'}
    <QueryError />
  {/if}
  {#if deletes.length > 0}
    <div
      class="card preset-tonal-warning space-y-2 p-4 text-sm"
      role="status"
      transition:slide={{ duration: motion(150) }}
    >
      <p>{m.settings_deleteAccountRegionsGone()}</p>
      <ul class="list-inside list-disc font-semibold">
        {#each deletes as region (region.id)}
          <li>{region.name}</li>
        {/each}
      </ul>
    </div>
  {/if}
</Form>
