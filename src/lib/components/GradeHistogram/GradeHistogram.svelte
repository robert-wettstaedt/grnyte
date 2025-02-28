<script lang="ts">
  import { page } from '$app/state'
  import Vega, { type VegaProps } from '$lib/components/Vega'
  import { getGradeColor } from '$lib/grades'

  interface Props extends Partial<VegaProps> {
    axes?: boolean
    data: Array<{ grade: string | undefined | null }>
  }

  const { axes = true, data, ...rest }: Props = $props()
</script>

<Vega
  {...rest}
  spec={{
    background: 'transparent',
    data: {
      values: data.map((d) => ({ ...d, grade: d.grade ?? 'no grade' })),
    },
    mark: 'bar',

    ...(rest.spec as any),

    encoding: {
      ...(rest.spec as any)?.encoding,
      color: {
        legend: null,
        field: 'grade',
        scale: {
          domain: [...page.data.grades.map((grade) => grade[page.data.gradingScale]), 'no grade'],
          range: [...page.data.grades.map((grade) => getGradeColor(grade)), '#bcc0cc'],
        },
      },
      x: {
        axis: axes
          ? {
              title: null,
              labelExpr: "indexof(domain('x'), datum.value) % 2 === 1 || datum.value === 'no grade' ? datum.label : ''",
            }
          : null,
        field: 'grade',
        scale: {
          domain: [...page.data.grades.map((grade) => grade[page.data.gradingScale]), 'no grade'],
        },
        type: 'nominal',
        title: 'Grade',
      },
      y: {
        axis: axes ? { title: null } : null,
        aggregate: 'count',
        field: 'grade',
        title: 'Count',
      },
    },
  }}
  opts={{
    ...rest.opts,
    actions: false,
    renderer: 'svg',
    theme: 'dark',
  }}
/>
