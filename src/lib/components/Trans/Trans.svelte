<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import type { Component, Snippet } from 'svelte'
  import type { Part } from './part'

  const { t } = $derived(getI18n())

  type RenderablePart = readonly [Component<any>, Record<string, any>, string]

  interface Props {
    children?: Snippet
    context?: string
    key: string
    values?: Record<string, string | Part<Component<any>> | null | undefined>
  }

  const { children, context, key, values }: Props = $props()

  const content = $derived.by(() => {
    const stringValues: Record<string, string> = {}
    Object.entries(values ?? {}).forEach(([key, value]) =>
      typeof value === 'string' ? (stringValues[key] = value) : null,
    )

    if (key) {
      const options = { ...stringValues, context }
      const result = t(key, options)
      const final = result && result !== key ? result : null
      if (final != null) {
        return final
      } else {
        console.warn('No translation found for ' + key + ' - ')
      }
    }

    return ''
  })

  const contentParts = $derived.by<Array<string | RenderablePart>>(() => {
    if (!content?.trim()) {
      return []
    }

    const regex = /(\{\{\w+\}\})/
    const split = content.split(regex)
    const prefix = '{{'

    const replaced = split.map((part): RenderablePart | string => {
      if (part.startsWith(prefix)) {
        const key = part.replace(/\{\{|\}\}/g, '')
        return values?.[key] ?? part
      }
      return part
    })

    return replaced.length > 0 ? replaced : [content]
  })
</script>

{#if contentParts.length}
  {#each contentParts as part, i (i)}
    {#if typeof part === 'string'}
      {@html part}
    {:else}
      {@const C = part[0]}
      <C {...part[1]}>{part[2]}</C>
    {/if}
  {/each}
{:else}
  {@render children?.()}
{/if}
