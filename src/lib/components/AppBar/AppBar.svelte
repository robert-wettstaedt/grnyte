<script lang="ts" module>
  export type ActionItemArgs = { buttonProps: HTMLAttributes<HTMLElement>; iconProps: HTMLAttributes<HTMLElement> }
</script>

<script lang="ts">
  import { AppBar, Menu, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  type OrigProps = Parameters<typeof AppBar>[1]
  interface Props extends OrigProps {
    actions?: Snippet<[ActionItemArgs]>
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
        <Menu>
          <Menu.Trigger class="btn-icon preset-outlined-primary-500">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </Menu.Trigger>

          <Portal>
            <Menu.Positioner>
              <Menu.Content class="z-50">
                {@render actions({
                  buttonProps: { class: 'flex w-full items-center' },
                  iconProps: { class: 'me-2 w-5' },
                })}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu>
      </AppBar.Trail>
    {/if}
  </AppBar.Toolbar>
</AppBar>

{#if content != null}
  <div class="preset-filled-surface-100-900 p-2 md:p-4">
    {@render content?.()}
  </div>
{/if}
