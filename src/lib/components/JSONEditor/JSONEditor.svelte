<script lang="ts" generics="T">
  import { indentWithTab } from '@codemirror/commands'
  import { EditorView, keymap, type EditorViewConfig } from '@codemirror/view'
  import { basicSetup } from 'codemirror'
  import { jsonSchema as jsonSchemaExtension } from 'codemirror-json-schema'
  import type { JSONSchema7 } from 'json-schema'
  import { onDestroy, onMount } from 'svelte'
  import { z } from 'zod'

  interface Props {
    onChange?: (value: T | null, isValid: boolean) => void
    schema: z.ZodSchema<T>
    value: string | undefined
  }

  let { onChange, schema, value }: Props = $props()

  let jsonSchema = $derived(z.toJSONSchema(schema) as JSONSchema7)

  let element: HTMLDivElement | undefined = $state()
  let view: EditorView | null = null

  const transactionHandler: EditorViewConfig['dispatchTransactions'] = async (trs, view) => {
    view.update(trs)

    const stringValue = view.state.doc.toString()

    try {
      let jsonValue = JSON.parse(stringValue)

      if (schema != null) {
        jsonValue = await schema.parseAsync(jsonValue)
      }

      value = jsonValue
      onChange?.(jsonValue, true)
    } catch (error) {
      onChange?.(null, false)
    }
  }

  const theme = EditorView.theme(
    { '.cm-gutters': { backgroundColor: 'rgba(var(--color-surface-800))' } },
    { dark: true },
  )

  onMount(async () => {
    view = new EditorView({
      doc: value,
      dispatchTransactions: transactionHandler,
      parent: element,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        keymap.of([indentWithTab]),
        theme,
        jsonSchemaExtension(jsonSchema),
      ],
    })
  })

  $effect(() => {
    try {
      const parsed = JSON.parse(value ?? '')
      const stringified = JSON.stringify(parsed, null, 2)
      view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: stringified },
      })
    } catch (error) {}
  })

  onDestroy(() => {
    view?.destroy()
  })
</script>

<div class="relative">
  <div bind:this={element} class="bg-surface-700 h-64"></div>
  <button
    class="btn btn-sm preset-filled absolute top-2 right-2"
    onclick={(event) => {
      event.preventDefault()
      const stringValue = view?.state.doc.toString()

      if (stringValue == null) {
        return
      }

      const jsonValue = JSON.parse(stringValue)

      view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: JSON.stringify(jsonValue, null, 2) },
      })
    }}
  >
    Prettify
  </button>
</div>

<style>
  :global(.cm-editor) {
    height: 100%;
  }
</style>
