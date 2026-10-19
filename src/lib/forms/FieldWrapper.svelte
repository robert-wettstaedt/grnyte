<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLAttributes } from 'svelte/elements'
  import FormHint from './FormHint.svelte'
  import OptionalBadge from './OptionalBadge.svelte'

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[HTMLAttributes<HTMLElement>]>
    class?: ClassValue
    /** A store field (or list/object container): its issues are read. */
    field: { issues(): RemoteFormIssue[] | undefined }
    hint?: string
    label?: string
    required?: boolean
  }

  const { children, field, hint, id, label, required, ...rest }: Props = $props()

  const issues = $derived(field.issues() ?? [])
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

  {@render children({
    'aria-invalid': issues.length === 0 ? undefined : 'true',
    ...(id == null
      ? {}
      : {
          'aria-describedby': hint == null ? undefined : `${id}-hint`,
          'aria-errormessage': issues.length === 0 ? undefined : `${id}-error`,
          id,
        }),
  })}

  <FormHint {hint} {id} {issues} />
</div>
