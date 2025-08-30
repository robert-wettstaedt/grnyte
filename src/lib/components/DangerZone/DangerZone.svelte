<script lang="ts">
  import { enhance, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { Accordion, Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    name: string
    onDelete: () => any | Promise<any>
  }

  const { name, onDelete }: Props = $props()

  let enhancedState = $state<EnhanceState>({})
  let open = $state(false)
</script>

<Accordion classes="card preset-filled-surface-100-900 mt-8">
  <Accordion.Item value="club">
    {#snippet control()}
      Danger zone
    {/snippet}

    {#snippet panel()}
      <nav>
        <ul>
          <li class="flex items-center justify-between p-2 md:p-4">
            <div class="flex flex-col">
              <span> Delete {name} </span>
              <span class="text-sm opacity-70">This action cannot be undone</span>
            </div>

            <Popover
              {open}
              arrow
              arrowBackground="!bg-surface-200 dark:!bg-surface-800"
              contentBase="card bg-surface-200-800 max-w-[320px] space-y-4 p-4"
              onOpenChange={(value) => (open = enhancedState.loading ? false : value.open)}
              positioning={{ placement: 'top' }}
              triggerBase="btn preset-filled-error-500 !text-white {enhancedState.loading ? 'disabled' : ''}"
            >
              {#snippet trigger()}
                {#if enhancedState.loading}
                  <ProgressRing meterStroke="stroke-white" size="size-6" value={null} />
                {:else}
                  <i class="fa-solid fa-trash"></i>
                {/if}

                Delete {name}
              {/snippet}

              {#snippet content()}
                <article>
                  <p>Are you sure you want to delete this {name}?</p>
                </article>

                <footer class="flex justify-end">
                  <button
                    class="btn btn-sm preset-filled-error-500 !text-white"
                    onclick={() => {
                      open = false
                      enhance(onDelete, enhancedState)
                    }}
                  >
                    Yes
                  </button>
                </footer>
              {/snippet}
            </Popover>
          </li>
        </ul>
      </nav>
    {/snippet}
  </Accordion.Item>
</Accordion>
