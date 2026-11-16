<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import FormError from '$lib/forms/FormError.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { replaceUrl } from '$lib/state/navigation.svelte'
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
      if (outcome.kind === 'done') {
        await invalidate('supabase:auth')
        // Replaced: a finished profile step is not one to go back to.
        await replaceUrl(outcome.result.redirectTo)
      }
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_profileTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_profileTitle()}</h1>
<p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">{m.auth_profileSubtitle()}</p>

<form class="flex flex-col gap-4" oninput={store.capture} {onsubmit} novalidate>
  <FormError form={store} />

  <AuthField
    field={store.fields.username}
    label={m.auth_username()}
    type="text"
    placeholder={m.auth_usernamePlaceholder()}
    autocomplete="nickname"
    autocapitalize="none"
    spellcheck="false"
    enterkeyhint="done"
    autofocus
  />

  <SegmentedControl class="flex flex-col gap-1.5" name="gradingScale" value={store.fields.gradingScale.value()}>
    <SegmentedControl.Label class="text-[13px] font-semibold">{m.settings_gradeScale()}</SegmentedControl.Label>
    <SegmentedControl.Control
      class="bg-surface-50-950 border-surface-200-800 grid w-full grid-cols-2 rounded-xl border p-1"
    >
      <SegmentedControl.Indicator class="preset-filled-primary-500 rounded-[9px]" />
      {#each scales as scale (scale.value)}
        <SegmentedControl.Item value={scale.value} class="h-10 justify-center">
          <SegmentedControl.ItemText class="data-[state=checked]:text-primary-contrast-500 text-sm font-semibold">
            {scale.label}
          </SegmentedControl.ItemText>
          <SegmentedControl.ItemHiddenInput />
        </SegmentedControl.Item>
      {/each}
    </SegmentedControl.Control>
  </SegmentedControl>

  <button
    type="submit"
    class="btn preset-filled-primary-500 mt-1 h-12.5 w-full font-semibold disabled:opacity-60"
    disabled={submitting}
  >
    {m.auth_profileSubmit()}
  </button>
</form>

<p class="text-surface-500 mt-7 text-center text-[11.5px] leading-normal">
  {m.auth_termsAgree({ name: PUBLIC_APPLICATION_NAME })}
  <a href={resolve('/legal/terms')} class="text-surface-600-400 underline">{m.legal_terms_title()}</a>
  &amp;
  <a href={resolve('/legal/privacy')} class="text-surface-600-400 underline">{m.legal_privacy_title()}</a>
  .
</p>
