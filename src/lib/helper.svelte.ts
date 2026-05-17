import { getI18n } from './i18n'

export function getBlockName<T extends { name: string; order: number }>(block: T | null | undefined): string {
  if (block == null) {
    return ''
  }

  const { t } = getI18n()

  return block.name.length === 0 ? `${t('entities.block')} ${block.order}` : block.name
}
