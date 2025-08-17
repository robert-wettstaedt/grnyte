<script lang="ts" module>
  export interface GradeHistogramProps extends Partial<VegaProps> {
    axes?: boolean
    data: Array<{ grade: string | undefined | null }>
  }
</script>

<script lang="ts">
  import Vega, { type VegaProps } from '$lib/components/Vega'
  import { getGradeColor } from '$lib/grades'
  import { pageState } from '$lib/components/Layout'

  const { axes = true, data, ...rest }: GradeHistogramProps = $props()
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
          domain: [...pageState.grades.map((grade) => grade[pageState.gradingScale]), 'no grade'],
          range: [...pageState.grades.map((grade) => getGradeColor(grade)), '#bcc0cc'],
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
          domain: [...pageState.grades.map((grade) => grade[pageState.gradingScale]), 'no grade'],
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
