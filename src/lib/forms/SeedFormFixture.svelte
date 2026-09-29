<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import FormError from './FormError.svelte'
  import RemoteFormInputWrapper from './RemoteFormInputWrapper.svelte'
  import { seedForm } from './seedOnKeyChange.svelte'

  interface Props {
    /** When set, renders its FormError and seeds it from an effect, as a reopened surface does. */
    form?: {
      readonly element: HTMLFormElement | null
      fields: { allIssues: () => RemoteFormIssue[] | undefined; set: (values: Record<string, unknown>) => unknown }
    }
    seed?: boolean
  }

  const { form, seed = false }: Props = $props()

  // A `bind:` input is what registers Svelte's document-level reset listener.
  let bound = $state('typed')

  $effect(() => {
    if (form != null && seed) void seedForm(form, { name: 'seeded' })
  })
</script>

<form>
  {#if form != null}
    <FormError {form} />
    <RemoteFormInputWrapper
      field={{ issues: () => form.fields.allIssues()?.filter((issue) => issue.path.length > 0) }}
      id="name"
    >
      {#snippet children(props)}
        <input name="name" value="seeded" {...props} />
      {/snippet}
    </RemoteFormInputWrapper>
  {:else}
    <input name="name" value="seeded" />
  {/if}
  <input name="bound" bind:value={bound} />
</form>
