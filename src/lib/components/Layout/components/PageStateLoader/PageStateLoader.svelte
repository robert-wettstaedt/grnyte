<script lang="ts">
  import { page } from '$app/state'
  import { Query } from 'zero-svelte'
  import { pageState } from '../../page.svelte'
  import { setContext, type Snippet } from 'svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  setContext('z', page.data.z)

  const gradesResult = new Query(page.data.z.current.query.grades)
  const tagsResult = new Query(page.data.z.current.query.tags)

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

  const permissionsResult = new Query(page.data.z.current.query.rolePermissions)

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
    pageState.grades = gradesResult.current
  })

  $effect(() => {
    pageState.tags = tagsResult.current
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

  let isLoading = $derived(
    (userResult != null && userResult.current == null && userResult.details.type !== 'complete') ||
      (userRoleResult != null && userRoleResult.current == null && userRoleResult.details.type !== 'complete') ||
      (userRegionsResult != null &&
        userRegionsResult.current == null &&
        userRegionsResult.details.type !== 'complete') ||
      (permissionsResult != null && permissionsResult.current == null && permissionsResult.details.type !== 'complete'),
  )
</script>

{#if isLoading}
  <div class="fixed flex h-full w-full items-center justify-center">
    <ProgressRing value={null} />
  </div>
{:else}
  {@render children?.()}
{/if}
