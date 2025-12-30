<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    buttons?: Snippet
    disabled?: boolean
    label: string
    pending: number
  }

  const { buttons, disabled = false, label, pending }: Props = $props()
</script>

<div class="mt-8 flex justify-between md:items-center">
  <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

  <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
    {#if buttons}
      {@render buttons()}
    {/if}

    <button class="btn preset-filled-primary-500" type="submit" disabled={pending > 0 || disabled}>
      {#if pending > 0}
        <span class="me-2">
          <Progress value={null}>
            <Progress.Circle class="[--size:--spacing(4)]">
              <Progress.CircleTrack />
              <Progress.CircleRange />
            </Progress.Circle>
            <Progress.ValueText />
          </Progress>
        </span>
      {/if}

      {label}
    </button>
  </div>
</div>
