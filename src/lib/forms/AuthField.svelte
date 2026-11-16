<script lang="ts">
  import FormHint from '$lib/forms/FormHint.svelte'
  import type { StoreField } from '$lib/forms/store.svelte'
  import type { RemoteFormField } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { HTMLInputAttributes } from 'svelte/elements'

  // Reusable credential field: design-styled label row + input + issue messages.
  // Shared by the auth pages and the account settings forms.
  interface Props {
    /** Optional trailing content on the label row, e.g. a “Forgot?” link. */
    action?: Snippet
    autocapitalize?: 'characters' | 'none' | 'sentences' | 'words'
    /** Drives mobile autofill / keychain / password-manager: see the per-field tokens on each page. */
    autocomplete: HTMLInputAttributes['autocomplete']
    autofocus?: boolean
    /** Mobile keyboard's enter-key label: 'next' for non-final fields, 'go'/'done' for the last. */
    enterkeyhint?: HTMLInputAttributes['enterkeyhint']
    field: RemoteFormField<string> | StoreField<string>
    inputmode?: HTMLInputAttributes['inputmode']
    label: string
    maxlength?: number
    oninput?: HTMLInputAttributes['oninput']
    pattern?: string
    /** Omit on pre-filled fields, where it only ever repeats the label. */
    placeholder?: string
    readonly?: boolean
    required?: boolean
    spellcheck?: 'false' | 'true'
    type: 'email' | 'password' | 'text'
  }

  const {
    action,
    autocapitalize,
    autocomplete,
    autofocus = false,
    enterkeyhint,
    field,
    inputmode,
    label,
    maxlength,
    oninput,
    pattern,
    placeholder,
    readonly,
    required = true,
    spellcheck = 'false',
    type,
  }: Props = $props()

  const id = $props.id()

  // One read for the hint and the input's aria.
  const issues = $derived(field.issues() ?? [])
  const attributes = $derived(field.as(type))
</script>

<div class="relative flex flex-col gap-1.5">
  <label for={id} class="text-surface-950-50 self-start text-[13px] font-semibold">{label}</label>

  <input
    {...attributes}
    {@attach (node) => {
      if (autofocus) node.focus()
    }}
    name={attributes.name || undefined}
    {id}
    {autocomplete}
    {autocapitalize}
    {enterkeyhint}
    {inputmode}
    {maxlength}
    {oninput}
    {pattern}
    {readonly}
    {required}
    autocorrect="off"
    {spellcheck}
    aria-invalid={issues.length === 0 ? undefined : 'true'}
    aria-errormessage={issues.length === 0 ? undefined : `${id}-error`}
    class="input h-12 px-3.5"
    {placeholder}
  />

  <!-- Drawn on the label row but after the input, so Tab reaches the field first. Outside the
       <label>, which would label a button inside it too. -->
  {#if action != null}
    <div class="absolute end-0 top-0 flex h-5 items-center">{@render action()}</div>
  {/if}

  <FormHint {id} {issues} />
</div>
