<script lang="ts">
  import { page } from '$app/state'
  import { getGradeColor } from '$lib/grades'

  interface Props {
    oldGrade: number | undefined | null
    newGrade: number | undefined | null
  }

  let { oldGrade, newGrade }: Props = $props()

  const oldGradeConfig = $derived(page.data.grades.find((grade) => (oldGrade == null ? false : grade.id === oldGrade)))

  const newGradeConfig = $derived(page.data.grades.find((grade) => (newGrade == null ? false : grade.id === newGrade)))

  const background = $derived.by(() => {
    const oldColor = oldGradeConfig == null ? undefined : getGradeColor(oldGradeConfig)
    const newColor = newGradeConfig == null ? undefined : getGradeColor(newGradeConfig)

    if (oldColor == null && newColor == null) {
      return 'none'
    }

    if (oldColor == null || newColor == null) {
      return newColor ?? oldColor
    }

    return `linear-gradient(125deg, ${oldColor} 50%, ${newColor} 50%)`
  })
</script>

<span class="badge text-white" style={`background: ${background}`}>
  {#if newGradeConfig?.id == null || newGradeConfig?.id === oldGradeConfig?.id}
    {oldGradeConfig?.[page.data.gradingScale]}
  {:else}
    {#if oldGradeConfig != null}
      <s>
        {oldGradeConfig?.[page.data.gradingScale]}
      </s>

      &nbsp;
    {/if}

    {newGradeConfig?.[page.data.gradingScale]}
  {/if}
</span>
