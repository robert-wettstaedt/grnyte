<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import Selectable from './Selectable.svelte'
  import { Selection } from './selection.svelte'
  import SelectToggle from './SelectToggle.svelte'

  const { Story } = defineMeta({
    component: Selectable,
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Components/GuidebookPicker/Selectable',
  })

  const rows = [
    { id: 1, title: 'Kante direkt' },
    { id: 2, title: 'Linke Kante' },
    { id: 3, title: 'Dach' },
  ]

  const ticked = new Selection()
  ticked.start()
  ticked.toggle(1)
  ticked.toggle(3)
</script>

{#snippet list(selection: Selection)}
  <section class="w-80 space-y-2">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">3 routes</h2>
      <SelectToggle {selection} />
    </div>
    <nav class="flex flex-col gap-1.5">
      {#each rows as row (row.id)}
        <Selectable id={row.id} label={row.title} {selection}>
          <a class="border-surface-200-800 block rounded-xl border px-3 py-3 text-sm font-semibold" href="#{row.id}">
            {row.title}
          </a>
        </Selectable>
      {/each}
    </nav>
  </section>
{/snippet}

<Story name="Browsing">
  {@render list(new Selection())}
</Story>

<Story name="Two ticked">
  {@render list(ticked)}
</Story>
