<script lang="ts" module>
  /** A picked climber, an existing first ascensionist, the signed-in user, or a new name. */
  export interface FaClimber {
    name: string
    /** Set when the climber is a registered user (e.g. "Me"). */
    userFk?: number
  }
</script>

<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { firstAscensionistList } from '$lib/entities/firstAscensionist/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  // Chips-in-a-box climber picker with typeahead over the region's first ascensionists.
  // "Me" links the signed-in user; unknown names become new first-ascensionist rows on
  // submit (no account needed). Submits via hidden `firstAscensionists[i].*` inputs.
  interface Props {
    /** The route's region, suggestions come from its first ascensionists. */
    regionFk: number
    /** The picked climbers, in pick order. */
    value?: FaClimber[]
  }

  let { regionFk, value = $bindable([]) }: Props = $props()

  const global = getGlobalState()
  const ascensionists = firstAscensionistList(() => ({ regionFk }))

  let query = $state('')
  let open = $state(false)
  let input: HTMLInputElement | undefined = $state()
  let blurTimer: ReturnType<typeof setTimeout> | undefined

  const picked = (name: string) => value.some((climber) => climber.name.toLowerCase() === name.toLowerCase())

  const pick = (climber: FaClimber) => {
    if (!picked(climber.name)) {
      value = [...value, climber]
    }
    query = ''
    input?.focus()
  }

  const me = $derived(global.user)
  const needle = $derived(query.trim().toLowerCase())

  const showMe = $derived(
    me != null &&
      !value.some((climber) => climber.userFk === me.id) &&
      (needle === '' || 'me'.startsWith(needle) || me.username.toLowerCase().includes(needle)),
  )

  const suggestions = $derived(
    ascensionists.data
      .filter(
        (fa) =>
          !picked(fa.name) &&
          (me == null || fa.userFk !== me.id) &&
          (needle === '' || fa.name.toLowerCase().includes(needle) || fa.username?.toLowerCase().includes(needle)),
      )
      .slice(0, 5),
  )

  const showNew = $derived(
    query.trim().length >= 2 &&
      !picked(query.trim()) &&
      !ascensionists.data.some((fa) => fa.name.toLowerCase() === needle),
  )

  /** A chip for a name the region hasn't seen yet, flagged so the "new" badge can say
   *  a row will be created on save. */
  const isNew = (climber: FaClimber) =>
    climber.userFk == null && !ascensionists.data.some((fa) => fa.name.toLowerCase() === climber.name.toLowerCase())

  const onFocus = () => {
    clearTimeout(blurTimer)
    open = true
  }
  // Delay so a mousedown-pick on a suggestion row lands before the list closes.
  const onBlur = () => {
    blurTimer = setTimeout(() => (open = false), 150)
  }
  const keepFocus = (event: MouseEvent) => event.preventDefault()
</script>

{#each value as climber, index (climber.name)}
  <input name="firstAscensionists[{index}].name" type="hidden" value={climber.name} />
  <input name="firstAscensionists[{index}].userFk" type="hidden" value={climber.userFk ?? ''} />
{/each}

<div
  class="border-surface-300-700 bg-surface-100-900 flex min-h-13 flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2"
>
  {#each value as climber, index (climber.name)}
    <span
      class="border-surface-300-700 bg-surface-200-800 flex h-8.5 items-center gap-2 rounded-full border py-0.5 pr-1 pl-1"
    >
      <Avatar name={climber.name} size={26} solid={climber.userFk != null} />
      <span class="text-[13px] font-semibold whitespace-nowrap">{climber.name}</span>
      {#if isNew(climber)}
        <span
          class="bg-primary-500/20 text-primary-700-300 flex h-4.5 items-center rounded-full px-1.5 text-[10px] font-bold tracking-wide uppercase"
        >
          {m.routes_form_faNewBadge()}
        </span>
      {/if}
      <button
        aria-label={m.common_remove()}
        class="hover:bg-surface-300-700 flex size-5.5 items-center justify-center rounded-full"
        onclick={() => (value = value.filter((_, i) => i !== index))}
        type="button"
      >
        <Icon name="close" size={12} />
      </button>
    </span>
  {/each}

  <input
    autocapitalize="words"
    autocomplete="off"
    bind:this={input}
    bind:value={query}
    class="h-8.5 min-w-32 flex-1 border-none bg-transparent px-1 text-sm focus:ring-0 focus:outline-none"
    onblur={onBlur}
    onfocus={onFocus}
    placeholder={value.length > 0 ? m.routes_form_faPlaceholderMore() : m.routes_form_faPlaceholder()}
    type="text"
  />
</div>

{#if open && (showMe || suggestions.length > 0 || showNew)}
  <div class="border-surface-300-700 bg-surface-50-950 mt-2 overflow-hidden rounded-xl border">
    {#if showMe && me != null}
      <button
        class="hover:bg-surface-100-900 flex w-full items-center gap-3 px-3 py-2.5 text-left"
        onclick={() => pick({ name: me.username, userFk: me.id })}
        onmousedown={keepFocus}
        type="button"
      >
        <Avatar solid>{m.common_me()}</Avatar>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold">{m.common_me()}</span>
          <span class="text-surface-600-400 block text-xs">{m.routes_form_faMeHint({ name: me.username })}</span>
        </span>
      </button>
    {/if}

    {#each suggestions as fa (fa.id)}
      <button
        class="hover:bg-surface-100-900 flex w-full items-center gap-3 px-3 py-2.5 text-left"
        onclick={() => pick({ name: fa.name, userFk: fa.userFk })}
        onmousedown={keepFocus}
        type="button"
      >
        <Avatar name={fa.name} />
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold">{fa.name}</span>
          {#if fa.username != null}
            <span class="text-surface-600-400 block truncate text-xs">@{fa.username}</span>
          {/if}
        </span>
      </button>
    {/each}

    {#if showNew}
      <button
        class="hover:bg-surface-100-900 flex w-full items-center gap-3 px-3 py-2.5 text-left"
        onclick={() => pick({ name: query.trim() })}
        onmousedown={keepFocus}
        type="button"
      >
        <Avatar><Icon name="plus" size={14} /></Avatar>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold">
            {m.routes_form_faAddNew({ name: query.trim() })}
          </span>
          <span class="text-surface-600-400 block text-xs">{m.routes_form_faNewHint()}</span>
        </span>
      </button>
    {/if}
  </div>
{/if}
