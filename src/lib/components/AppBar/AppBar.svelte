<script lang="ts">
  import { AppBar, Popover } from '@skeletonlabs/skeleton-svelte'

  type OrigProps = Parameters<typeof AppBar>[1]
  type Props = Omit<OrigProps, 'trail'> & {
    actions?: OrigProps['trail']
    hasActions?: boolean
  }

  const { actions, hasActions = false, ...props }: Props = $props()
</script>

<AppBar {...props} leadClasses="flex-wrap" toolbarClasses="items-center">
  {#snippet trail()}
    {#if actions != null && hasActions}
      <div class="md:hidden">
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
          zIndex="50"
          positioning={{ placement: 'bottom-end' }}
          triggerBase="btn preset-outlined-primary-500"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-ellipsis-vertical"></i>
          {/snippet}

          {#snippet content()}
            <article class="action-list flex flex-wrap">{@render actions()}</article>
          {/snippet}
        </Popover>
      </div>

      <div class="hidden space-x-4 md:flex rtl:space-x-reverse">
        {@render actions()}
      </div>
    {/if}
  {/snippet}
</AppBar>

<style>
  :global(.action-list .btn),
  :global(.action-list > *) {
    background: none;
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
    border-bottom: 1px solid;
    display: flex;
    padding: 1rem;

    &:hover {
      background: rgb(var(--color-primary-500) / var(--tw-bg-opacity, 1));
    }

    &:last-child {
      border: none;
    }
  }
</style>
