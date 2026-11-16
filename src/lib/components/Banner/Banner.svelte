<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import type { Snippet } from 'svelte'

  // A notice in a screen's flow: red for a failure (an alert), neutral for information (a status).
  interface Props {
    children: Snippet
    class?: string
    icon?: IconName
    tone?: 'error' | 'info'
  }

  const { children, class: className = '', icon, tone = 'info' }: Props = $props()
</script>

<div
  class={[
    'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13.5px] leading-snug',
    tone === 'error' ? 'border-error-500/35 bg-error-500/10' : 'bg-surface-100-900 border-surface-200-800',
    className,
  ]}
  role={tone === 'error' ? 'alert' : 'status'}
>
  <span class={['mt-px flex-none', tone === 'error' && 'text-error-600-400']}>
    <Icon name={icon ?? (tone === 'error' ? 'circle-alert' : 'info')} size={18} />
  </span>
  <div class="flex min-w-0 flex-col gap-1">{@render children()}</div>
</div>
