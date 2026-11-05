<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import MovePanel from './MovePanel.svelte'

  const { Story } = defineMeta({
    component: MovePanel,
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Components/GuidebookPicker/MovePanel',
  })

  const noop = () => {}
  const base = {
    emptyLabel: 'Nothing here yet',
    onjump: noop,
    onopen: noop,
    onpick: noop,
    placeholder: 'Search areas and sectors',
    settled: true,
  }
  const region = { id: null, label: 'Fränkische Schweiz' }
</script>

<Story
  name="Moving a block, browsing an area"
  args={{
    ...base,
    items: [
      { badge: 'Sector', id: 1, openable: true, title: 'Westgrat' },
      { badge: 'Sector', id: 2, openable: true, title: 'Ostgrat' },
      { badge: 'Sector', id: 3, reason: 'It’s already here', title: 'Kessel' },
      { badge: 'Area', id: 8, openable: true, title: 'Unterer Hang' },
    ],
    path: [region, { id: 10, label: 'Talhang' }, { id: 11, label: 'Oberer Hang' }],
  }}
/>

<Story
  name="Moving a block, sector opened"
  args={{
    ...base,
    items: [
      { id: -1, info: true, title: 'Großer Block' },
      { id: -2, info: true, title: 'Kleiner Block' },
    ],
    path: [region, { id: 10, label: 'Talhang' }, { id: 1, label: 'Westgrat' }],
  }}
/>

<Story
  name="Moving an area"
  args={{
    ...base,
    items: [
      { badge: 'Area', id: 4, openable: true, title: 'Unterer Hang' },
      { badge: 'Area', id: 9, reason: 'Can’t go inside itself', title: 'Oberer Hang' },
      { badge: 'Sector', dimmed: true, id: 5, title: 'Westgrat' },
    ],
    path: [region, { id: 10, label: 'Talhang' }],
  }}
/>

<Story
  name="Confirm topo lines"
  args={{
    ...base,
    items: [],
    path: [region],
    warning:
      '2 lines on the old block’s photos will be removed, because they trace that boulder. Undo won’t bring them back. Move to Kleiner Block?',
  }}
/>
