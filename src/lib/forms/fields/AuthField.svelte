<script lang="ts">
  import FormHint from '$lib/forms/fields/FormHint.svelte'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import type { StoreField } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { RemoteFormField } from '@sveltejs/kit'
  import { flushSync, type Snippet } from 'svelte'
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
    /** Under the field while it shows no error, e.g. "At least 8 characters." */
    hint?: string
    /** Replaces the input's default height and padding, e.g. the mailed-code field. */
    inputClass?: string
    inputmode?: HTMLInputAttributes['inputmode']
    label: string
    maxlength?: number
    oninput?: HTMLInputAttributes['oninput']
    /** Drawn over the input, inside its box; must not take pointer events. */
    overlay?: Snippet
    pattern?: string
    /** Omit on pre-filled fields, where it only ever repeats the label. */
    placeholder?: string
    readonly?: boolean
    required?: boolean
    /** A Show/Hide toggle inside a password field, keeping focus and the caret. */
    reveal?: boolean
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
    hint,
    inputClass = 'h-12 px-3.5',
    inputmode,
    label,
    maxlength,
    oninput,
    overlay,
    pattern,
    placeholder,
    readonly,
    required = true,
    reveal = false,
    spellcheck = 'false',
    type,
  }: Props = $props()

  const id = $props.id()
  let input = $state<HTMLInputElement>()
  let shown = $state(false)

  function toggle() {
    if (input == null) return
    const { selectionDirection, selectionEnd, selectionStart } = input
    shown = !shown
    // Applied now, so the selection is restored on the new type, not overwritten by it.
    flushSync()
    input.focus()
    input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined)
  }

  // One read for the hint and the input's aria.
  const issues = $derived(field.issues() ?? [])
  const attributes = $derived(field.as(type))

  // A space at either end is invisible in a masked field, so its error shows the password.
  const spaced = $derived(issues.some((issue) => resolveIssueMessage(issue.message) === m.auth_passwordSpaces()))
  $effect(() => {
    if (reveal && spaced) shown = true
  })
</script>

<div class="relative flex flex-col gap-1.5">
  <label for={id} class="text-surface-950-50 self-start text-[13px] font-semibold">{label}</label>

  <div class="relative">
    <input
      {...attributes}
      bind:this={input}
      {@attach (node) => {
        if (autofocus) node.focus()
      }}
      type={shown ? 'text' : type}
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
      aria-describedby={hint != null && issues.length === 0 ? `${id}-hint` : undefined}
      class={[
        // The page colour, also inside a card, as on the boards.
        'input bg-surface-50-950',
        inputClass,
        reveal && 'pe-20',
        // `.input` draws its border as an inset ring: a full red 1px ring, then a soft glow outside it.
        // `!` on focus: the app's global focus ring is unlayered and would paint over the error ring.
        issues.length > 0 &&
          'ring-error-600-400 focus-visible:ring-error-600-400! shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-error-500)_18%,transparent)] ring-1 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-error-500)_18%,transparent)]!',
      ]}
      {placeholder}
    />
    {@render overlay?.()}

    {#if reveal}
      <!-- `pointerdown` prevented so a click never takes focus from the field. -->
      <button
        type="button"
        class="text-primary-600-400 absolute inset-y-0 end-1 flex min-w-11 items-center justify-center px-2 text-[12.5px] font-semibold"
        aria-controls={id}
        aria-pressed={shown}
        onpointerdown={(event) => event.preventDefault()}
        onclick={toggle}
      >
        {shown ? m.auth_passwordHide() : m.auth_passwordShow()}
      </button>
    {/if}
  </div>

  <!-- Drawn on the label row but after the input, so Tab reaches the field first. Outside the
       <label>, which would label a button inside it too. -->
  {#if action != null}
    <div class="absolute end-0 top-0 flex h-5 items-center">{@render action()}</div>
  {/if}

  <FormHint {id} {issues} errorClass="text-error-600-400 text-[12.5px] leading-snug font-semibold" />
  {#if hint != null && issues.length === 0}
    <p id="{id}-hint" class="text-surface-600-400 text-[12.5px] leading-snug">{hint}</p>
  {/if}
</div>
