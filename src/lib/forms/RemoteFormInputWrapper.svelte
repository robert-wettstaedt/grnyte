<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLAttributes } from 'svelte/elements'
  import FormHint from './FormHint.svelte'
  import OptionalBadge from './OptionalBadge.svelte'

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[HTMLAttributes<HTMLElement>]>
    class?: ClassValue
    /** The remote-form field (or array/object field container) — only its issues are read. */
    field: { issues(): RemoteFormIssue[] | undefined }
    hint?: string
    label?: string
    required?: boolean
  }

  const { children, field, hint, id, label, required, ...rest }: Props = $props()
</script>

<div {...rest}>
  {#if label}
    <label class="text-surface-700-300 mb-1.5 flex items-center gap-2 text-sm font-semibold" for={id}>
      {label}

      {#if !required}
        <OptionalBadge />
      {/if}
    </label>
  {/if}

  {@render children(id == null ? {} : { 'aria-describedby': `${id}-hint`, 'aria-errormessage': `${id}-error`, id })}

  <FormHint {hint} {id} issues={field.issues()} />
</div>
