<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import RestructureRows from './RestructureRows.svelte'

  const { Story } = defineMeta({
    component: RestructureRows,
    parameters: { layout: 'centered', width: 360 },
    tags: ['autodocs'],
    title: 'Components/GuidebookPicker/RestructureRows',
  })

  const noop = () => {}
  const base = {
    close: noop,
    deleteIcon: 'map-pin-x' as const,
    deleteLabel: 'Delete block',
    ondelete: noop,
    onmerge: noop,
    onmove: noop,
  }
</script>

<Story name="Editor who may delete" args={{ ...base, canMerge: true, canMove: true }} />

<Story name="Editor only" args={{ ...base, canMerge: false, canMove: true }} />
