<script lang="ts" module>
  /** One field the person decides, with the value each side holds. */
  export interface MergeQuestion {
    key: string
    label: string
    options: { caption: string; side: 'source' | 'survivor'; value: string }[]
  }
</script>

<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fade, fly } from 'svelte/transition'
  import GuidebookPicker, { type PickerItem } from './GuidebookPicker.svelte'

  // What a merge sheet shows at each step, from plain values: `MergeSheet` owns the data and the flow.
  interface Props {
    chosen?: Record<string, 'source' | 'survivor'>
    confirm: {
      body: string
      /** Known before the counts, so their rows hold their space while the server counts. */
      countLabels?: string[]
      /** Null while the server is counting. */
      counts: null | { label: string; value: number }[]
      onback: () => void
      onmerge: () => void
      /** The merge may remove topo lines, so `warning` gets space before the counts say. */
      warnable?: boolean
      /** Set when the merge removes topo lines. */
      warning?: string
    }
    fields: { onback: () => void; onnext: () => void; questions: MergeQuestion[] }
    pick: {
      emptyLabel: string
      items: PickerItem[]
      onpick: (item: PickerItem) => void
      pinned: PickerItem[]
      pinnedLabel: string
      placeholder: string
      settled: boolean
    }
    query?: string
    step: 'confirm' | 'fields' | 'pick'
  }

  let { chosen = $bindable({}), confirm, fields, pick, query = $bindable(''), step }: Props = $props()

  // Long values start clamped; the toggle only changes how much of one is shown.
  let expanded = $state<Record<string, boolean>>({})
  const LONG = 120
</script>

{#if step === 'pick'}
  <div in:fly={{ duration: motion(), x: -24 }}>
    <GuidebookPicker bind:query fill {...pick} />
  </div>
{:else if step === 'fields'}
  <div class="flex flex-col gap-4 py-2" in:fly={{ duration: motion(), x: 24 }}>
    <p class="text-surface-600-400 text-sm">{m.merges_fieldsIntro()}</p>
    {#each fields.questions as question (question.key)}
      <fieldset class="flex flex-col gap-1">
        <legend class="text-surface-500 pb-1 text-xs font-bold tracking-wider uppercase">{question.label}</legend>
        {#each question.options as option (option.side)}
          {@const id = `${question.key}:${option.side}`}
          <label
            class={[
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 active:scale-[0.99]',
              chosen[question.key] === option.side ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200-800',
            ]}
          >
            <input
              bind:group={chosen[question.key]}
              class="radio mt-0.5"
              name={question.key}
              type="radio"
              value={option.side}
            />
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class={['text-sm break-words whitespace-pre-line', !expanded[id] && 'line-clamp-2']}>
                {option.value}
              </span>
              {#if option.value.length > LONG}
                <button
                  class="text-primary-600-400 self-start text-xs font-semibold"
                  onclick={(event) => {
                    event.preventDefault()
                    expanded[id] = !expanded[id]
                  }}
                  type="button"
                >
                  {expanded[id] ? m.merges_less() : m.merges_more()}
                </button>
              {/if}
              <span class="text-surface-500 text-xs">{option.caption}</span>
            </span>
          </label>
        {/each}
      </fieldset>
    {/each}
    <div class="flex flex-col gap-2 md:flex-row-reverse">
      <button class="btn preset-filled-primary-500 active:scale-[0.97]" onclick={fields.onnext} type="button">
        {m.merges_next()}
      </button>
      <button class="btn preset-tonal active:scale-[0.97]" onclick={fields.onback} type="button">
        {m.common_back()}
      </button>
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-4 py-2" in:fly={{ duration: motion(), x: 24 }}>
    <p class="text-sm">{confirm.body}</p>
    <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {#each confirm.counts ?? (confirm.countLabels ?? []).map( (label) => ({ label, value: null }) ) as count (count.label)}
        <dt>{count.label}</dt>
        <dd class="tabular-nums">
          {#if count.value == null}
            <span class="bg-surface-200-800 inline-block h-4 w-6 animate-pulse rounded align-middle"></span>
          {:else}
            <span in:fade={{ duration: motion() }}>{count.value}</span>
          {/if}
        </dd>
      {/each}
    </dl>
    {#if confirm.warnable || confirm.warning != null}
      <!-- Its space is held from the start, so the warning arriving with the counts moves nothing. -->
      <p class="text-warning-700-300 min-h-10 text-sm">
        {#if confirm.warning != null}<span in:fade={{ duration: motion() }}>{confirm.warning}</span>{/if}
      </p>
    {/if}
    <p class="text-surface-600-400 text-sm">{m.merges_noUndo()}</p>
    <div class="flex flex-col gap-2 md:flex-row-reverse">
      <button
        class="btn preset-filled-error-500 active:scale-[0.97]"
        disabled={confirm.counts == null}
        onclick={confirm.onmerge}
        type="button"
      >
        {m.merges_confirm()}
      </button>
      <button class="btn preset-tonal active:scale-[0.97]" onclick={confirm.onback} type="button">
        {m.common_back()}
      </button>
    </div>
  </div>
{/if}
