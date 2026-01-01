<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import type { ClassValue } from 'svelte/elements'

  type Sizes = 4 | 6 | 8 | 12 | 20

  interface Props {
    class?: ClassValue | null
    rangeClass?: string
    size?: Sizes | string
    style?: string | null
    trackClass?: string
  }

  const { rangeClass, size = 4, trackClass, ...props }: Props = $props()

  const sizes: Record<Sizes, string> = {
    '4': '[--size:--spacing(4)]',
    '6': '[--size:--spacing(6)]',
    '8': '[--size:--spacing(8)]',
    '12': '[--size:--spacing(12)]',
    '20': '[--size:--spacing(20)]',
  }
</script>

<Progress {...props} value={null}>
  <Progress.Circle
    class={typeof size === 'number' ? sizes[size] : undefined}
    style={typeof size === 'string' ? `--size: ${size}` : undefined}
  >
    <Progress.CircleTrack class={trackClass} />
    <Progress.CircleRange class={rangeClass} />
  </Progress.Circle>
</Progress>
