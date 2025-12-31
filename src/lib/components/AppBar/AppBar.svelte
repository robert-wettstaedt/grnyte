<script lang="ts">
  import { AppBar, Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'

  type OrigProps = Parameters<typeof AppBar>[1]
  interface Props extends OrigProps {
    actions?: Snippet
    content?: Snippet
    hasActions?: boolean
    headline?: Snippet
  }

  const { actions, content, hasActions = false, headline, ...props }: Props = $props()
</script>

<AppBar {...props}>
  <AppBar.Toolbar class="grid-cols-[1fr_auto]">
    <AppBar.Headline>{@render headline?.()}</AppBar.Headline>

    {#if actions != null && hasActions}
      <AppBar.Trail>
        <div class="hidden space-x-4 lg:flex rtl:space-x-reverse">
          {@render actions()}
        </div>

        <div class="lg:hidden">
          <!-- TODO zIndex:50 -->
          <Popover positioning={{ placement: 'bottom-end' }}>
            <Popover.Trigger class="btn-icon preset-outlined-primary-500">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </Popover.Trigger>

            <Portal>
              <Popover.Positioner>
                <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4 shadow-lg">
                  <Popover.Arrow class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]">
                    <Popover.ArrowTip />
                  </Popover.Arrow>

                  <Popover.Description>
                    <article class="action-list flex flex-wrap">{@render actions()}</article>
                  </Popover.Description>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover>
        </div>
      </AppBar.Trail>
    {/if}
  </AppBar.Toolbar>
</AppBar>

<div class="preset-filled-surface-100-900 p-2 md:p-4">
  {@render content?.()}
</div>

<style>
  :global(.action-list .btn),
  :global(.action-list > *) {
    background: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    font-size: 1rem;
    height: auto;
    justify-content: start;
    width: 100%;
  }

  :global(.action-list > * .btn) {
    padding: 0;
  }

  :global(.action-list > *) {
    && {
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
      display: flex;
      padding: 1rem;
    }

    &:hover {
      background: var(--color-primary-500);
    }

    &:last-child {
      border-bottom: none !important;
    }
  }
</style>
