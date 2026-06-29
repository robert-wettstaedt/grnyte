<script lang="ts" generics="T extends RemoteFormFieldValue">
  import type { RemoteFormField, RemoteFormFieldValue } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLAttributes } from 'svelte/elements'
  import { m } from '$lib/paraglide/messages'
  import FormHint from './FormHint.svelte'

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[HTMLAttributes<HTMLElement>]>
    class?: ClassValue
    field: RemoteFormField<T>
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
        <span
          class="bg-surface-200-800 text-surface-500 inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold tracking-[0.03em] uppercase"
        >
          {m.optional()}
        </span>
      {/if}
    </label>
  {/if}

  {@render children(id == null ? {} : { id, 'aria-describedby': `${id}-hint`, 'aria-errormessage': `${id}-error` })}

  <FormHint {hint} {id} issues={field.issues()} />
</div>
