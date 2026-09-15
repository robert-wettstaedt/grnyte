<script module lang="ts">
  import { TIER_COUNTS as countByGrade, graded } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import AreaRow from './AreaRow.svelte'

  const { Story } = defineMeta({
    args: { countByGrade, name: 'Roadside', total: graded(countByGrade) },
    component: AreaRow,
    parameters: {
      layout: 'centered',
      width: 360,
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/AreaRow',
  })
</script>

<Story name="Default" />

<Story name="As link" args={{ href: '#' }} />
