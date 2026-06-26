<script lang="ts">
  import FormHint from '$lib/forms/FormHint.svelte'
  import type { RemoteFormField } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { HTMLInputAttributes } from 'svelte/elements'

  // Reusable auth form field: design-styled label row + input + issue messages.
  // Shared by the sign-in and sign-up pages.
  interface Props {
    field: RemoteFormField<string>
    label: string
    type: 'email' | 'password' | 'text'
    placeholder: string
    /** Drives mobile autofill / keychain / password-manager — see the per-field tokens on each page. */
    autocomplete: HTMLInputAttributes['autocomplete']
    /** Mobile keyboard's enter-key label: 'next' for non-final fields, 'go'/'done' for the last. */
    enterkeyhint?: HTMLInputAttributes['enterkeyhint']
    autocapitalize?: 'none' | 'sentences' | 'words' | 'characters'
    required?: boolean
    autofocus?: boolean
    /** Optional trailing content on the label row, e.g. a “Forgot?” link. */
    action?: Snippet
  }

  const {
    field,
    label,
    type,
    placeholder,
    autocomplete,
    enterkeyhint,
    autocapitalize,
    required = true,
    autofocus = false,
    action,
  }: Props = $props()

  const id = $props.id()
</script>

<label class="flex flex-col gap-1.5">
  <div class="flex items-center justify-between">
    <span class="text-surface-950-50 text-[13px] font-semibold">{label}</span>
    {@render action?.()}
  </div>

  <input
    {...field.as(type)}
    {@attach (node) => {
      if (autofocus) node.focus()
    }}
    {id}
    {autocomplete}
    {autocapitalize}
    {enterkeyhint}
    {required}
    autocorrect="off"
    spellcheck="false"
    aria-errormessage="{id}-error"
    class="input h-12 px-3.5"
    {placeholder}
  />

  <FormHint {id} issues={field.issues()} />
</label>
