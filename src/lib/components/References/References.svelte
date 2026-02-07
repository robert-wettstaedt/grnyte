<script lang="ts">
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { References } from '.'
  import { getI18n } from '$lib/i18n'

  interface Props {
    references: References
  }

  let { references }: Props = $props()
  const { t } = getI18n()
</script>

<nav class="list-nav">
  <ul>
    {#each references.routes as route}
      <li>
        <a class="anchor hover:preset-tonal-primary flex px-4 py-3" href={`/routes/${route.id}`}>
          <RouteName {route} />
        </a>
      </li>
    {/each}

    {#each references.areas as area}
      <li>
        <a class="anchor hover:preset-tonal-primary flex px-4 py-3 hover:text-white" href={`/areas/${area.id}`}>
          {area.name}
        </a>
      </li>
    {/each}

    {#each references.ascents as ascent}
      {#if ascent.author != null && ascent.route != null}
        <li>
          <a
            class="anchor hover:preset-tonal-primary flex px-4 py-3 hover:text-white"
            href={`/routes/${ascent.route?.id}`}
          >
            {t('references.ascentOfPrefix', { username: ascent.author.username })}
            &nbsp;
            <RouteName route={ascent.route} />
          </a>
        </li>
      {/if}
    {/each}
  </ul>
</nav>
