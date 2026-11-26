<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { signOut } from '$lib/auth/session.remote'
  import Message from '$lib/components/Message/Message.svelte'
  import { submitCommand } from '$lib/forms/command'
  import AuthField from '$lib/forms/fields/AuthField.svelte'
  import FormError from '$lib/forms/fields/FormError.svelte'
  import { formError } from '$lib/forms/schemas'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import { wipeAndLeave } from '$lib/state/pwa/wipe'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import { completeProfile } from './profile.remote'
  import { profileSchema } from './schemas'

  const store = createFormStore(profileSchema)
  // By UI language, never country: a locale added later gets FB until it is named here.
  store.fields.set({
    gradingScale: getLocale() === 'en' ? 'V' : 'FB',
    next: page.url.searchParams.get('next') ?? undefined,
    username: '',
  })

  const scales = [
    { label: m.settings_gradeScaleFB(), value: 'FB' },
    { label: m.settings_gradeScaleV(), value: 'V' },
  ] as const

  let submitting = $state(false)

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    if (submitting) return
    submitting = true
    try {
      const outcome = await store.submit((values) => submitCommand(() => completeProfile(values)))
      if (outcome.kind === 'offline') store.setIssue(null, formError('error_offline_title'))
      if (outcome.kind === 'done') {
        await invalidate('supabase:auth')
        // Replaced: a finished profile step is not one to go back to.
        await replaceUrl(outcome.result.redirectTo)
      }
    } finally {
      submitting = false
    }
  }

  // The way out for somebody signed in to an account they did not mean to finish.
  const leave = signOut.enhance(async ({ submit }) => {
    if (await submit()) await wipeAndLeave(resolve('/auth/signin'))
  })
</script>

<svelte:head>
  <title>{m.auth_profileTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_profileTitle()}</h1>
<p class="text-surface-600-400 mb-5.5 text-[14.5px] leading-snug">{m.auth_profileSubtitle()}</p>

<form class="flex flex-col gap-4.5" oninput={store.capture} {onsubmit} novalidate>
  <FormError form={store} />

  <AuthField
    field={store.fields.username}
    label={m.auth_username()}
    type="text"
    placeholder={m.auth_usernamePlaceholder()}
    hint={m.auth_usernameHint()}
    autocomplete="nickname"
    autocapitalize="none"
    spellcheck="false"
    enterkeyhint="done"
    autofocus
  />

  <SegmentedControl class="flex flex-col gap-1.5" name="gradingScale" value={store.fields.gradingScale.value()}>
    <SegmentedControl.Label class="text-[13px] font-semibold">{m.settings_gradeScale()}</SegmentedControl.Label>
    <SegmentedControl.Control
      class="border-surface-200-800 grid w-full grid-cols-2 rounded-xl border bg-[light-dark(var(--color-surface-50),var(--color-surface-900))] p-1"
    >
      <SegmentedControl.Indicator class="preset-filled-primary-500 rounded-[9px]" />
      {#each scales as scale (scale.value)}
        <SegmentedControl.Item value={scale.value} class="h-10 justify-center">
          <SegmentedControl.ItemText
            class="text-surface-600-400 data-[state=checked]:text-primary-contrast-500 text-sm font-semibold"
          >
            {scale.label}
          </SegmentedControl.ItemText>
          <SegmentedControl.ItemHiddenInput />
        </SegmentedControl.Item>
      {/each}
    </SegmentedControl.Control>
    <p class="text-surface-600-400 text-[12.5px] leading-snug">{m.auth_profileScaleHint()}</p>
  </SegmentedControl>

  <button
    type="submit"
    class="btn preset-filled-primary-500 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
    disabled={submitting}
  >
    {m.auth_profileSubmit()}
  </button>
</form>

<p class="text-surface-500 mt-4 text-center text-xs leading-normal">
  <Message key="auth_profileTerms" parts={{ privacy, terms }} />
</p>
{#snippet terms()}
  <a href={resolve('/legal/terms')} class="text-surface-600-400 underline">{m.legal_terms_title()}</a>
{/snippet}
{#snippet privacy()}
  <a href={resolve('/legal/privacy')} class="text-surface-600-400 underline">{m.legal_privacy_title()}</a>
{/snippet}

<form class="mt-5.5 flex justify-center" {...leave}>
  <input {...signOut.fields.redirectTo.as('hidden', resolve('/(landing)/auth'))} />
  <button type="submit" class="text-primary-600-400 text-[13.5px] font-bold" disabled={signOut.pending > 0}>
    {m.settings_signOut()}
  </button>
</form>
