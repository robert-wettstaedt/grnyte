import type { Row, RowWithRelations } from '$lib/db/zero'

interface PageState {
  grades: Row<'grades'>[]
  gradingScale: NonNullable<Row<'userSettings'>['gradingScale']>
  tags: Row<'tags'>[]
  user: RowWithRelations<'users', { userSettings: true }> | undefined
  userPermissions: App.SafeSession['userPermissions']
  userRegions: App.SafeSession['userRegions']
  userRole: App.SafeSession['userRole']
}

export const pageState = $state<PageState>({
  grades: [],
  gradingScale: 'FB',
  tags: [],
  user: undefined,
  userPermissions: undefined,
  userRegions: [],
  userRole: undefined,
})
