<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormIssue } from '@sveltejs/kit'

  interface Props {
    id?: string
    issues?: RemoteFormIssue[]
  }

  let { id, issues }: Props = $props()

  const { t } = getI18n()
</script>

{#each issues as issue}
  {@const parsed = (() => {
    try {
      const p = JSON.parse(issue.message)
      return p?.message ? p : null
    } catch {
      return { message: issue.message }
    }
  })()}

  <div {id}>
    <p class="text-error-500 text-sm opacity-80">
      {t(parsed.message, parsed.params)}
    </p>
  </div>
{/each}
