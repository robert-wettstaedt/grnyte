<script lang="ts">
  import GradeDonut from '$lib/components/GradeDonut/GradeDonut.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '../Markdown/Markdown.svelte'
  import Row from './Row.svelte'

  interface Props {
    /** Area name. */
    name: string
    description?: string
    /** Route counts keyed by grade id (`gradeFk`) — drives the donut. */
    countByGrade: Map<number, number>
    /** Total routes, shown in the donut centre. */
    total: number
    /** Eyebrow line — typically the geographic region. */
    region?: string
    /** Breadcrumb path of parent areas. */
    crumbs?: string | string[]
    /** Render as a link. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** `card` (listing) or `option` (compact `@`-picker row). */
    variant?: 'card' | 'option'
    /** Keyboard-highlight state — only for the `option` variant. */
    active?: boolean
  }

  let {
    name,
    countByGrade,
    description,
    total,
    region,
    crumbs,
    href,
    onclick,
    variant = 'card',
    active = false,
  }: Props = $props()
</script>

{#snippet body()}
  {#if description != null}
    <Markdown className="short" disableLinks encloseReferences="strong" markdown={description} />
  {/if}
{/snippet}

<!-- The option row drops the markdown description (avoids rendering nested
     references inside the picker) and shrinks the donut. -->
<Row
  title={name}
  {region}
  {crumbs}
  description={variant === 'option' ? undefined : body}
  {href}
  {onclick}
  {variant}
  {active}
>
  <GradeDonut {countByGrade} {total} size={variant === 'option' ? 40 : 52} />

  {#snippet rightContent()}
    {#if variant !== 'option'}
      <span class="end-col">
        <Icon name="chevron-right" size={17} strokeWidth={2.2} class="text-surface-500 shrink-0" />
      </span>
    {/if}
  {/snippet}
</Row>

<style>
  .end-col {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
</style>
