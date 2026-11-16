<script lang="ts">
  import type { RemoteFormField, RemoteFormIssue } from '@sveltejs/kit'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import BotCheck from './BotCheck.svelte'

  // An anonymous remote form with no visible fields, sent from code (a code step's Resend). Each
  // send waits for a fresh proof-of-work solve, as a visible form's submit does.
  interface BotForm {
    enhance(callback: (options: { submit: () => Promise<unknown> }) => Promise<void>): HTMLFormAttributes
    fields: { allIssues(): RemoteFormIssue[] | undefined }
  }

  interface Props {
    form: BotForm
    values: Record<string, string | undefined>
  }

  const { form, values }: Props = $props()

  let element: HTMLFormElement | undefined = $state()
  let waiting: null | { reject: (cause: unknown) => void; resolve: () => void } = null

  /** Resolves once the server answered without an issue; rejects with the first issue. */
  export function send(): Promise<void> {
    return new Promise((resolve, reject) => {
      waiting = { reject, resolve }
      element?.requestSubmit()
    })
  }

  const enhanced = $derived(
    form.enhance(async ({ submit }) => {
      const settle = waiting
      waiting = null
      try {
        await submit()
      } catch (cause) {
        settle?.reject(cause)
        return
      }
      const issue = form.fields.allIssues()?.[0]
      if (issue == null) settle?.resolve()
      else settle?.reject({ body: { message: issue.message } })
    }),
  )

  // The schema spreads `botFields`; the structural type above does not name its fields.
  const botFields = $derived(form.fields as unknown as { hpcheck: RemoteFormField<string> })
</script>

<form bind:this={element} hidden {...enhanced}>
  <BotCheck fields={botFields} />
  {#each Object.entries(values) as [name, value] (name)}
    {#if value != null}
      <input type="hidden" {name} {value} />
    {/if}
  {/each}
</form>
