<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import GuidebookPicker from './GuidebookPicker.svelte'

  const { Story } = defineMeta({
    component: GuidebookPicker,
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Components/GuidebookPicker',
  })

  const base = { emptyLabel: 'No sectors found', onpick: () => {}, placeholder: 'Search sectors', settled: true }
</script>

<Story
  name="Browse"
  args={{
    ...base,
    items: [
      { crumbs: ['Talhang'], id: 1, openable: true, title: 'Westgrat' },
      { crumbs: ['Talhang'], id: 2, openable: true, title: 'Ostgrat' },
      { crumbs: ['Talhang'], id: 3, reason: 'Holds areas, not blocks', title: 'Unterer Hang' },
    ],
  }}
/>

<Story
  name="Nearest first"
  args={{
    ...base,
    items: [
      { crumbs: ['Talhang'], id: 1, meta: '120 m', title: 'Westgrat' },
      { crumbs: ['Talhang'], id: 2, meta: '1.4 km', title: 'Ostgrat' },
      { crumbs: ['Bachtal'], id: 3, title: 'Kessel' },
    ],
    pinned: [
      { crumbs: ['Talhang'], id: 1, meta: '120 m', title: 'Westgrat' },
      { crumbs: ['Talhang'], id: 2, meta: '1.4 km', title: 'Ostgrat' },
    ],
    restLabel: 'Without a location',
  }}
/>

<Story
  name="Siblings pinned"
  args={{
    ...base,
    items: [{ crumbs: ['Talhang', 'Westgrat'], id: 9, title: 'Kante links' }],
    pinned: [
      { crumbs: ['Talhang', 'Westgrat'], id: 4, title: 'Kante' },
      { crumbs: ['Talhang', 'Westgrat'], id: 5, title: 'Riss' },
    ],
    pinnedLabel: 'On this block',
    placeholder: 'Search routes',
  }}
/>

<Story name="Still syncing" args={{ ...base, items: [], settled: false }} />

<Story name="Nothing found" args={{ ...base, items: [] }} />
