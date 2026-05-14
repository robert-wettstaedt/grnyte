<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { enhance, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { Accordion, Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import { slide } from 'svelte/transition'

  interface Props {
    name: string
    onDelete: () => any | Promise<any>
  }

  const { name, onDelete }: Props = $props()

  const { t } = getI18n()
  let enhancedState = $state<EnhanceState>({})
  let open = $state(false)
</script>

<Accordion class="card preset-filled-surface-100-900 mt-8">
  <Accordion.Item value="club">
    <h3>
      <Accordion.ItemTrigger class="flex items-center justify-between gap-2 font-bold">
        {t('dangerZone.title')}

        <Accordion.ItemIndicator class="group">
          <i class="fa-solid fa-chevron-down transition group-data-[state=open]:rotate-180"></i>
        </Accordion.ItemIndicator>
      </Accordion.ItemTrigger>
    </h3>

    <Accordion.ItemContent>
      {#snippet element(attributes)}
        {#if !attributes.hidden}
          <div {...attributes} transition:slide={{ duration: 150 }}>
            <nav>
              <ul>
                <li class="flex items-center justify-between p-2 md:p-4">
                  <div class="flex flex-col">
                    <span>{t('dangerZone.delete', { name })}</span>
                    <span class="text-sm opacity-70">{t('dangerZone.cannotUndo')}</span>
                  </div>

                  <Popover
                    {open}
                    onOpenChange={(value) => (open = enhancedState.loading ? false : value.open)}
                    positioning={{ placement: 'top' }}
                  >
                    <Popover.Trigger
                      class="btn preset-filled-error-500 text-white! {enhancedState.loading ? 'disabled' : ''}"
                    >
                      {#if enhancedState.loading}
                        <LoadingIndicator size={6} rangeClass="stroke-white" />
                      {:else}
                        <i class="fa-solid fa-trash"></i>
                      {/if}

                      {t('dangerZone.delete', { name })}
                    </Popover.Trigger>

                    <Portal>
                      <Popover.Positioner>
                        <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                          <Popover.Description>
                            <article>
                              <p>{t('dangerZone.confirmDelete', { name })}</p>
                            </article>

                            <footer class="flex justify-end">
                              <button
                                class="btn btn-sm preset-filled-error-500 text-white!"
                                onclick={() => {
                                  open = false
                                  enhance(onDelete, enhancedState)
                                }}
                              >
                                {t('common.yes')}
                              </button>
                            </footer>
                          </Popover.Description>

                          <Popover.Arrow
                            class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]"
                          >
                            <Popover.ArrowTip />
                          </Popover.Arrow>
                        </Popover.Content>
                      </Popover.Positioner>
                    </Portal>
                  </Popover>
                </li>
              </ul>
            </nav>
          </div>
        {/if}
      {/snippet}
    </Accordion.ItemContent>
  </Accordion.Item>
</Accordion>
