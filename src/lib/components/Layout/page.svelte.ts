import type { Row, RowWithRelations } from '$lib/db/zero'

interface PageState {
  grades: Row<'grades'>[]
  gradingScale: NonNullable<Row<'userSettings'>['gradingScale']>
  user: RowWithRelations<'users', { userSettings: true }> | undefined
  userPermissions: App.PageData['userPermissions']
  userRegions: App.PageData['userRegions']
  userRole: App.PageData['userRole']
}

export const pageState = $state<PageState>({
  grades: [],
  gradingScale: 'FB',
  user: undefined,
  userPermissions: undefined,
  userRegions: [],
  userRole: undefined,
})
