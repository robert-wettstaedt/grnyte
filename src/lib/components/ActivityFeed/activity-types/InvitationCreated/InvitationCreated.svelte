<script lang="ts">
  import Trans, { part } from '$lib/components/Trans'
  import type { UserEntity } from '../..'
  import type { ItemProps } from '../../components/Item'
  import UserEmailLink from '../../components/UserEmailLink'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withDetails'> & {
    entity: UserEntity
  }

  const { activity, withDetails }: Props = $props()

  const key = $derived.by(() => {
    let key = 'activity.invitation.created'

    if (activity.region != null) {
      key += '.withRegion'
    }

    key += `.${activity.newValue == null ? 'anon' : 'user'}`

    return key
  })
</script>

<Trans
  {key}
  values={{
    region: activity.region?.name,
    user: part(Username, { activity, withDetails }, ''),
    other: activity.newValue == null ? undefined : part(UserEmailLink, { email: activity.newValue }, ''),
  }}
></Trans>
