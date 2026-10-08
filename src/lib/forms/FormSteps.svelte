<script lang="ts">
  import { Steps } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    labels: string[]
    /** Omitted, the indicator only shows where the form is. */
    onStepChange?: (step: number) => void
    step: number
  }

  const { labels, onStepChange, step }: Props = $props()
</script>

<!-- Hairline full bleed like the header's, stepper aligned with the fields below it. -->
<div class="border-surface-200-800 flex-none border-b">
  <Steps
    class="mx-auto w-full max-w-screen-sm px-4 py-2.5"
    count={labels.length}
    {step}
    onStepChange={(details) => onStepChange?.(details.step)}
  >
    <Steps.List>
      {#each labels as label, index (index)}
        <Steps.Item {index}>
          <Steps.Indicator class="size-6 text-xs font-bold">{index + 1}</Steps.Indicator>
          <span class="text-xs font-semibold whitespace-nowrap">{label}</span>
          {#if index < labels.length - 1}
            <Steps.Separator />
          {/if}
        </Steps.Item>
      {/each}
    </Steps.List>
  </Steps>
</div>
