<script lang="ts">
  import { page } from '$app/state'
  import { Query } from 'zero-svelte'
  import { pageState } from '../../page.svelte'

  const { current: grades } = $derived(new Query(page.data.z.current.query.grades))

  const { current: tags } = $derived(new Query(page.data.z.current.query.tags))

  const userResult = $derived(
    page.data.session?.user.id == null
      ? undefined
      : new Query(
          page.data.z.current.query.users.where('authUserFk', page.data.session?.user.id).related('userSettings').one(),
        ),
  )

  const userRoleResult = $derived(
    page.data.session?.user.id == null
      ? undefined
      : new Query(page.data.z.current.query.userRoles.where('authUserFk', page.data.session.user.id).one()),
  )

  const userRegionsResult = $derived(
    page.data.session?.user.id == null
      ? undefined
      : new Query(
          page.data.z.current.query.regionMembers
            .where('authUserFk', page.data.session?.user.id)
            .where('isActive', 'IS NOT', null)
            .related('region'),
        ),
  )

  const permissionsResult = $derived(new Query(page.data.z.current.query.rolePermissions))

  const userPermissions = $derived(
    userRoleResult?.current == null
      ? undefined
      : permissionsResult.current
          .filter((permission) => permission.role === userRoleResult.current?.role)
          .map(({ permission }) => permission),
  )

  const userRegions = $derived(
    userRegionsResult?.current.map((member) => ({
      ...member,
      permissions: permissionsResult.current
        .filter(({ role }) => role === member.role)
        .map(({ permission }) => permission),
      name: member.region!.name,
      settings: member.region!.settings,
    })),
  )

  $effect(() => {
    pageState.grades = grades
  })

  $effect(() => {
    pageState.tags = tags
  })

  $effect(() => {
    pageState.gradingScale = userResult?.current?.userSettings?.gradingScale ?? 'FB'
  })

  $effect(() => {
    pageState.user = userResult?.current
  })

  $effect(() => {
    pageState.userRole = userRoleResult?.current?.role
  })

  $effect(() => {
    pageState.userPermissions = userPermissions
  })

  $effect(() => {
    pageState.userRegions = userRegions ?? []
  })
</script>
