<script lang="ts">
  import type { IconProps } from '@lucide/svelte'
  import { icons, type IconName } from './icons'

  interface Props extends Omit<IconProps, 'name'> {
    name: IconName
  }

  let { name, ...rest }: Props = $props()

  const SvgIcon = $derived(icons[name])
</script>

<SvgIcon {...rest} />
