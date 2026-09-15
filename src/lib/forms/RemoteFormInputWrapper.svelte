<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import type { ClassValue, HTMLAttributes } from 'svelte/elements'
  import FormHint from './FormHint.svelte'
  import OptionalBadge from './OptionalBadge.svelte'

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[HTMLAttributes<HTMLElement>]>
    class?: ClassValue
    /** The remote-form field (or array/object field container): its issues, and its value if it
     *  has one, are read. */
    field: { issues(): RemoteFormIssue[] | undefined; value?(): unknown }
    hint?: string
    label?: string
    required?: boolean
  }

  const { children, field, hint, id, label, required, ...rest }: Props = $props()

  const raised = $derived(field.issues() ?? [])

  // Containers hand back an object, which has no useful identity here, so they keep the old
  // always-show behaviour.
  const raw = $derived(field.value?.())
  const value = $derived(raw == null || typeof raw === 'object' ? undefined : String(raw))

  // The value the standing issues were raised against, read off the submit that raised them. Their
  // message text cannot stand in for it: a second rejection is often byte-identical to the first.
  let submitted = $state<string | undefined>(undefined)
  const trackSubmit: Attachment = (node) => {
    const form = node.closest('form')
    if (form == null) return
    // `?? ''` so an untouched field records "submitted empty" rather than "no baseline".
    const capture = () => (submitted = value ?? '')
    form.addEventListener('submit', capture)
    return () => form.removeEventListener('submit', capture)
  }

  // Kit exposes no way to clear an issue, so a corrected field goes on rendering the old one until
  // the next submit. Hide it once the reader changes the value it was raised against.
  const corrected = $derived(submitted !== undefined && value !== undefined && value !== submitted)

  // One read, so the aria ids and what FormHint actually renders cannot disagree.
  const issues = $derived(corrected ? [] : raised)
</script>

<div {...rest} {@attach trackSubmit}>
  {#if label}
    <label class="text-surface-700-300 mb-1.5 flex items-center gap-2 text-sm font-semibold" for={id}>
      {label}

      {#if !required}
        <OptionalBadge />
      {/if}
    </label>
  {/if}

  <!-- `aria-invalid` overrides the one `field.as(...)` sets, which still reads Kit's own issue
       state: without it a corrected field announces as invalid with nothing to announce. Callers
       spread these props after `as(...)`, so this wins. -->
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
