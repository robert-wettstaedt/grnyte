<script lang="ts">
  import { page } from '$app/state'
  import { queries } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { setContext, type Snippet } from 'svelte'
  import { Query } from 'zero-svelte'
  import { pageState } from '../../page.svelte'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  setContext('z', page.data.z)

  const gradesResult = $derived(new Query(queries.grades(page.data)))
  const tagsResult = $derived(new Query(queries.tags(page.data)))

  const userResult = $derived(new Query(queries.currentUser(page.data)))
  const userRoleResult = $derived(new Query(queries.currentUserRoles(page.data)))
  const userRegionsResult = $derived(new Query(queries.currentUserRegions(page.data)))

  const permissionsResult = $derived(new Query(queries.rolePermissions(page.data)))

  const userPermissions = $derived(
    permissionsResult.current
      ?.filter((permission) => permission.role === userRoleResult.current?.role)
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
    page.data.session?.user != null &&
      ((userResult.current == null && userResult.details.type !== 'complete') ||
        (userRoleResult.current == null && userRoleResult.details.type !== 'complete') ||
        (userRegionsResult.current == null && userRegionsResult.details.type !== 'complete') ||
        (permissionsResult.current == null && permissionsResult.details.type !== 'complete')),
  )
</script>

{#if isLoading}
  <div class="fixed flex h-full w-full items-center justify-center">
    <ProgressRing value={null} />
  </div>
{:else}
  {@render children?.()}
{/if}
