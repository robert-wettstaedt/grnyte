<script lang="ts">
  import { page } from '$app/state'
  import { queries } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { setContext, type Snippet } from 'svelte'
  import { pageState } from '../../page.svelte'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  setContext('z', page.data.z)

  const gradesResult = $derived(page.data.z.q(queries.grades(page.data)))
  const tagsResult = $derived(page.data.z.q(queries.tags(page.data)))

  const userResult = $derived(page.data.z.q(queries.currentUser(page.data)))
  const userRoleResult = $derived(page.data.z.q(queries.currentUserRoles(page.data)))
  const userRegionsResult = $derived(page.data.z.q(queries.currentUserRegions(page.data)))

  const permissionsResult = $derived(page.data.z.q(queries.rolePermissions(page.data)))

  $effect(() => {
    if (userResult.current?.id != null) {
      page.data.z.current.preload(queries.listAscents(page.data, { createdBy: userResult.current.id }))
    }
  })

  const userPermissions = $derived(
    permissionsResult.current
      ?.filter((permission) => permission.role === userRoleResult.current?.role)
      .map(({ permission }) => permission),
  )

  const userRegions = $derived(
    userRegionsResult?.data.map((member) => ({
      ...member,
      permissions: permissionsResult.data
        .filter(({ role }) => role === member.role)
        .map(({ permission }) => permission),
      name: member.region!.name,
      settings: member.region!.settings,
    })),
  )

  $effect(() => {
    pageState.grades = gradesResult.data
  })

  $effect(() => {
    pageState.tags = tagsResult.data
  })

  $effect(() => {
    pageState.gradingScale = userResult?.data?.userSettings?.gradingScale ?? 'FB'
  })

  $effect(() => {
    pageState.user = userResult?.data
  })

  $effect(() => {
    pageState.userRole = userRoleResult?.data?.role
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
