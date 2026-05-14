<script lang="ts">
  import AscentCreated from '../../activity-types/AscentCreated'
  import FavoriteCreated from '../../activity-types/FavoriteCreated'
  import FavoriteRemoved from '../../activity-types/FavoriteRemoved'
  import FileUploaded from '../../activity-types/FileUploaded'
  import GenericEntity from '../../activity-types/GenericEntity'
  import InvitationAccepted from '../../activity-types/InvitationAccepted'
  import InvitationCreated from '../../activity-types/InvitationCreated'
  import InvitationRemoved from '../../activity-types/InvitationRemoved'
  import UserApproved from '../../activity-types/UserApproved'
  import UserRemoved from '../../activity-types/UserRemoved'
  import UserRoleUpdated from '../../activity-types/UserRoleUpdated'
  import type { ItemProps } from '../Item'

  const { activity, withBreadcrumbs, withDetails }: Pick<ItemProps, 'activity' | 'withBreadcrumbs' | 'withDetails'> =
    $props()
</script>

{#if activity.entity.type === 'ascent' && activity.type === 'created'}
  <AscentCreated {activity} {withBreadcrumbs} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'created' && activity.columnName === 'role'}
  <UserApproved {activity} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'updated' && activity.columnName === 'role'}
  <UserRoleUpdated {activity} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'deleted' && activity.columnName === 'role'}
  <UserRemoved {activity} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'created' && activity.columnName === 'invitation'}
  <InvitationCreated {activity} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'updated' && activity.columnName === 'invitation'}
  <InvitationAccepted {activity} {withDetails} entity={activity.entity} />
{:else if activity.entity.type === 'user' && activity.type === 'deleted' && activity.columnName === 'invitation'}
  <InvitationRemoved {activity} {withDetails} entity={activity.entity} />
{:else if activity.type === 'created' && activity.columnName === 'favorite'}
  <FavoriteCreated {activity} {withDetails} />
{:else if activity.type === 'deleted' && activity.columnName === 'favorite'}
  <FavoriteRemoved {activity} {withDetails} />
{:else if activity.entityType == 'file'}
  <FileUploaded {activity} {withBreadcrumbs} {withDetails} />
{:else}
  <GenericEntity {activity} {withBreadcrumbs} {withDetails} />
{/if}
