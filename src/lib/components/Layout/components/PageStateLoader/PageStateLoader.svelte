<script lang="ts">
  import { page } from '$app/state'
  import { preload, queries } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount, type Snippet } from 'svelte'
  import { pageState } from '../../page.svelte'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  let isPreloading = $state(true)

  onMount(async () => {
    await preload(page.data)
    isPreloading = false
  })

  const gradesResult = $derived(page.data.z.q(queries.grades(page.data)))
  const tagsResult = $derived(page.data.z.q(queries.tags(page.data)))
  const userResult = $derived(page.data.z.q(queries.currentUser(page.data)))
  const userRoleResult = $derived(page.data.z.q(queries.currentUserRoles(page.data)))
  const userRegionsResult = $derived(page.data.z.q(queries.currentUserRegions(page.data)))

  const permissionsResult = $derived(page.data.z.q(queries.rolePermissions(page.data)))

  const userPermissions = $derived(
    permissionsResult.data
      ?.filter((permission) => permission.role === userRoleResult.data?.role)
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
      ((userResult.data == null && userResult.details.type !== 'complete') ||
        (userRoleResult.data == null && userRoleResult.details.type !== 'complete') ||
        (userRegionsResult.data == null && userRegionsResult.details.type !== 'complete') ||
        (permissionsResult.data == null && permissionsResult.details.type !== 'complete')),
  )
</script>

{#if isLoading || isPreloading}
  <div class="fixed top-0 flex h-full w-full items-center justify-center">
    <ProgressRing value={null} />
  </div>
{:else}
  {@render children?.()}
{/if}
