<script lang="ts">
  import FieldWrapper from '$lib/forms/FieldWrapper.svelte'
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { moderationGround, type ModerationGround } from './dto'
  import { GROUND_LABELS } from './mapper'

  interface Props {
    field: {
      issues(): RemoteFormIssue[] | undefined
      set(value: ModerationGround): void
      value(): ModerationGround | undefined
    }
    id: string
    legend: string
  }

  const { field, id, legend }: Props = $props()
</script>

<FieldWrapper {field} {id} required>
  {#snippet children(props)}
    <fieldset {...props} class="space-y-1">
      <legend class="text-surface-700-300 mb-1.5 text-sm font-semibold">{legend}</legend>
      {#each moderationGround as ground (ground)}
        <label class="hover:bg-surface-100-900 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm">
          <input
            checked={field.value() === ground}
            class="radio"
            name="ground"
            type="radio"
            value={ground}
            onchange={() => field.set(ground)}
          />
          {GROUND_LABELS[ground]()}
        </label>
      {/each}
    </fieldset>
  {/snippet}
</FieldWrapper>
