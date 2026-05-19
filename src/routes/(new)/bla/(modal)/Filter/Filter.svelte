<script lang="ts">
  import { untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import Modal from '$lib/components/Modal'
  import GradeRangeSlider from '$lib/components/RouteList/components/GradeRangeSlider'
  import { getI18n } from '$lib/i18n'

  interface Props {
    active: boolean
    loading: boolean
    numRoutes: number
  }

  const { active, loading, numRoutes }: Props = $props()

  const { t } = getI18n()

  let open = $state(false)
  let minGrade = $state<number | undefined>(undefined)
  let maxGrade = $state<number | undefined>(undefined)

  $effect(() => {
    if (!open) {
      return
    }

    untrack(() => {
      const minGradeParam = page.url.searchParams.get('minGrade')
      const maxGradeParam = page.url.searchParams.get('maxGrade')

      minGrade = minGradeParam ? Number(minGradeParam) : undefined
      maxGrade = maxGradeParam ? Number(maxGradeParam) : undefined
    })
  })

  const applyFilter = async () => {
    const url = new URL(page.url)
    const defaultMinGrade = pageState.grades.at(0)?.id
    const defaultMaxGrade = pageState.grades.at(-1)?.id

    if (minGrade === undefined || minGrade === defaultMinGrade) {
      url.searchParams.delete('minGrade')
    } else {
      url.searchParams.set('minGrade', String(minGrade))
    }

    if (maxGrade === undefined || maxGrade === defaultMaxGrade) {
      url.searchParams.delete('maxGrade')
    } else {
      url.searchParams.set('maxGrade', String(maxGrade))
    }

    await goto(url)
    open = false
  }

  const resetFilter = async () => {
    const url = new URL(page.url)
    url.searchParams.delete('minGrade')
    url.searchParams.delete('maxGrade')
    await goto(url)
    open = false
  }
</script>

<Modal bind:open title={t('common.filter')} subtitle={t('routes.routesCount', { count: numRoutes })}>
  {#snippet trigger(props)}
    <button
      {...props}
      class={[props.class, 'btn btn-sm', open ? 'preset-filled-primary-500' : 'preset-filled-surface-100-900']}
      onclick={() => (open = !open)}
    >
      {#if active}
        <span class="absolute top-0 right-0 z-10 h-2 w-2 rounded-full bg-red-500"></span>
      {/if}

      {#if loading}
        <LoadingIndicator class="flex justify-center" size={4} />
      {:else}
        <i class="fa-solid fa-filter text-sm"></i>
      {/if}
    </button>
  {/snippet}

  <div class="mt-4 flex flex-col gap-4 md:mt-0">
    <GradeRangeSlider bind:minGrade bind:maxGrade />

    <div class="flex items-center justify-end gap-2 pt-2">
      <button class="btn btn-sm preset-tonal" onclick={resetFilter}>
        {t('common.reset')}
      </button>

      <button class="btn btn-sm preset-filled-primary-500" onclick={applyFilter}>
        {t('common.apply')}
      </button>
    </div>
  </div>
</Modal>
