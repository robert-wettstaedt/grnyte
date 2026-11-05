<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MergePanel from './MergePanel.svelte'

  const { Story } = defineMeta({
    component: MergePanel,
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Components/GuidebookPicker/MergePanel',
  })

  const noop = () => {}
  const LONG =
    'Start sitting on the flat boulder to the left, hands in the obvious undercling. Pull on, match the sloper and throw for the crimp rail. Topping out goes right over the mossy bulge, so brush it first after rain.'

  const base = {
    confirm: {
      body: 'Kante will be merged into Linke Kante. Everything attached to it moves over:',
      countLabels: ['Ascents', 'Photos and videos'],
      counts: null,
      onback: noop,
      onmerge: noop,
      warnable: true,
    },
    fields: { onback: noop, onnext: noop, questions: [] },
    pick: {
      emptyLabel: 'No match in this region',
      items: [{ crumbs: ['Talhang', 'Westgrat'], id: 9, title: 'Kante links' }],
      onpick: noop,
      pinned: [
        { crumbs: ['Talhang', 'Westgrat'], id: 4, title: 'Linke Kante' },
        { crumbs: ['Talhang', 'Westgrat'], id: 5, title: 'Riss' },
      ],
      pinnedLabel: 'In the same sector',
      placeholder: 'Search by name',
      settled: true,
    },
  }
</script>

<Story name="Pick the survivor" args={{ ...base, step: 'pick' }} />

<Story
  name="Fields that differ"
  args={{
    ...base,
    chosen: { description: 'survivor', gradeFk: 'source' },
    fields: {
      onback: noop,
      onnext: noop,
      questions: [
        {
          key: 'gradeFk',
          label: 'Grade',
          options: [
            { caption: 'On Linke Kante, which stays', side: 'survivor', value: '7A' },
            { caption: 'From Kante', side: 'source', value: '7A+' },
          ],
        },
        {
          key: 'description',
          label: 'Description',
          options: [
            { caption: 'On Linke Kante, which stays', side: 'survivor', value: LONG },
            { caption: 'From Kante', side: 'source', value: 'Sit start, then straight up the arete.' },
          ],
        },
      ],
    },
    step: 'fields',
  }}
/>

<Story name="Confirm while counting" args={{ ...base, step: 'confirm' }} />

<Story
  name="Confirm a block merge"
  args={{
    ...base,
    confirm: {
      ...base.confirm,
      counts: [
        { label: 'Ascents', value: 12 },
        { label: 'Photos and videos', value: 3 },
        { label: 'Topos', value: 1 },
        { label: 'Entries inside', value: 4 },
      ],
    },
    step: 'confirm',
  }}
/>

<Story
  name="Confirm with topo lines removed"
  args={{
    ...base,
    confirm: {
      ...base.confirm,
      counts: [
        { label: 'Ascents', value: 2 },
        { label: 'Photos and videos', value: 0 },
      ],
      warning: '1 line on the duplicate’s block photos will be removed, because it traces that boulder.',
    },
    step: 'confirm',
  }}
/>
