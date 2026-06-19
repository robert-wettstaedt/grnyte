<script lang="ts" generics="T extends RemoteFormFieldValue">
  import type { RemoteFormField, RemoteFormFieldValue } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLAttributes } from 'svelte/elements'
  import FormHint from './FormHint.svelte'

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[HTMLAttributes<HTMLElement>]>
    class?: ClassValue
    field: RemoteFormField<T>
    hint?: string
    label?: string
  }

  const { children, field, hint, id, label, ...rest }: Props = $props()
</script>

<div {...rest}>
  {#if label}
    <label class="text-surface-700-300 text-sm font-semibold" for={id}>
      {label}
    </label>
  {/if}

  {@render children(id == null ? {} : { id, 'aria-describedby': `${id}-hint`, 'aria-errormessage': `${id}-error` })}

  <FormHint {hint} {id} issues={field.issues()} />
</div>
