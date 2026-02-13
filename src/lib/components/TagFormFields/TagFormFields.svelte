<script lang="ts">
  import type { Tag } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'

  interface Props {
    id: Tag['id']
  }

  let { id }: Props = $props()

  const { t } = getI18n()
</script>

<label class="label">
  <span>{t('common.id')}</span>
  <input class="input" name="id" type="text" placeholder={t('common.enterId')} value={id} />
</label>
