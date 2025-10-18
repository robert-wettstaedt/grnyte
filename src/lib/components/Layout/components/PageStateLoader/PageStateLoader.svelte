<script lang="ts">
  import { page } from '$app/state'
  import type { Row, RowWithRelations, Schema } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { setContext, type Snippet } from 'svelte'
  import type { Query } from 'zero-svelte'
  import { pageState } from '../../page.svelte'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  setContext('z', page.data.z)

  const gradesResult = page.data.z.createQuery(page.data.z.query.grades)
  const tagsResult = page.data.z.createQuery(page.data.z.query.tags)

  type ExtractArrayElement<T> = T extends readonly (infer U)[] ? U : T

  let userResult = $state<
    | Query<Schema, 'users', ExtractArrayElement<RowWithRelations<'users', { userSettings: true }>> | undefined>
    | undefined
  >(undefined)
  $effect(() => {
    userResult =
      page.data.session?.user.id == null
        ? undefined
        : page.data.z.createQuery(
            page.data.z.query.users.where('authUserFk', page.data.session?.user.id).related('userSettings').one(),
          )
  })

  let userRoleResult = $state<
    Query<Schema, 'userRoles', ExtractArrayElement<Row<'userRoles'>> | undefined> | undefined
  >(undefined)
  $effect(() => {
    userRoleResult =
      page.data.session?.user.id == null
        ? undefined
        : page.data.z.createQuery(page.data.z.query.userRoles.where('authUserFk', page.data.session.user.id).one())
  })

  let userRegionsResult = $state<
    Query<Schema, 'regionMembers', RowWithRelations<'regionMembers', { region: true }>> | undefined
  >(undefined)
  userRegionsResult =
    page.data.session?.user.id == null
      ? undefined
      : page.data.z.createQuery(
          page.data.z.query.regionMembers
            .where('authUserFk', page.data.session?.user.id)
            .where('isActive', 'IS NOT', null)
            .related('region'),
        )

  const permissionsResult = page.data.z.createQuery(page.data.z.query.rolePermissions)

  const userPermissions = $derived(
    userRoleResult?.data == null
      ? undefined
      : permissionsResult.data
          .filter((permission) => permission.role === userRoleResult?.data?.role)
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
    (userResult != null && userResult.data == null && userResult.details.type !== 'complete') ||
      (userRoleResult != null && userRoleResult.data == null && userRoleResult.details.type !== 'complete') ||
      (userRegionsResult != null && userRegionsResult.data == null && userRegionsResult.details.type !== 'complete') ||
      (permissionsResult != null && permissionsResult.data == null && permissionsResult.details.type !== 'complete'),
  )
</script>

{#if isLoading}
  <div class="fixed flex h-full w-full items-center justify-center">
    <ProgressRing value={null} />
  </div>
{:else}
  {@render children?.()}
{/if}
