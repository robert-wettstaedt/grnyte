<script lang="ts">
  import { Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Props } from './types'

  let { children, open = $bindable(), popoverProps, subtitle, title, trigger }: Props = $props()
</script>

<Popover {...popoverProps} {open} onOpenChange={(event) => (open = event.open)}>
  <Popover.Trigger element={trigger}></Popover.Trigger>

  <Portal>
    <Popover.Positioner>
      <!-- Zag mirrors the content's z-index onto the positioner, so this is what stacks the
           whole popover. z-60 clears the map's area dialog (z-50) instead of hiding behind it. -->
      <Popover.Content class="card bg-surface-50-950 border-surface-100-900 z-60 w-96 border-b-2">
        <div class="space-y-4">
          <header class="flex flex-col px-4 py-2 shadow">
            {#if subtitle}
              <span class="text-sm opacity-60">{subtitle}</span>
            {/if}

            <span class="text-lg">{title}</span>
          </header>

          <Popover.Description class="px-4 pb-4">
            {@render children?.()}
          </Popover.Description>
        </div>

        <Popover.Arrow class="[--arrow-background:var(--color-surface-50-950)] [--arrow-size:--spacing(2)]">
          <Popover.ArrowTip />
        </Popover.Arrow>
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
