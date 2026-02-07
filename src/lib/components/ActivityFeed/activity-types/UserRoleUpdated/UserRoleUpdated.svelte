<script lang="ts">
  import Trans, { part } from '$lib/components/Trans'
  import type { UserEntity } from '../..'
  import type { ItemProps } from '../../components/Item'
  import UserLink from '../../components/UserLink'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withDetails'> & {
    entity: UserEntity
  }

  const { activity, entity, withDetails }: Props = $props()

  const user = $derived(entity.object)
  const key = $derived.by(() => {
    let key = 'activity.user.roleUpdated'

    if (activity.region != null) {
      key += '.withRegion'
    }

    key += `.${user == null ? 'anon' : 'user'}`

    return key
  })
</script>

<Trans
  {key}
  values={{
    region: activity.region?.name,
    role: activity.newValue,
  }}
  parts={{
    user: part(Username, { activity, withDetails }, ''),
    other: user == null ? undefined : part(UserLink, { user }, ''),
  }}
></Trans>
