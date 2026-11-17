// The PowerSync build swaps each Zero module below for its twin, and screens are typed against the Zero one only:
// a twin must fit wherever its sibling's exports are used. `twins.test.ts` fails on a twin missing here.
export type Twins = [
  Fits<
    typeof import('$lib/entities/area/resources.powersync.svelte'),
    typeof import('$lib/entities/area/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/ascent/resources.powersync.svelte'),
    typeof import('$lib/entities/ascent/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/block/resources.powersync.svelte'),
    typeof import('$lib/entities/block/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/favorite/resources.powersync.svelte'),
    typeof import('$lib/entities/favorite/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/file/resources.powersync.svelte'),
    typeof import('$lib/entities/file/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/firstAscensionist/resources.powersync.svelte'),
    typeof import('$lib/entities/firstAscensionist/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/geolocation/resources.powersync.svelte'),
    typeof import('$lib/entities/geolocation/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/grade/resources.powersync.svelte'),
    typeof import('$lib/entities/grade/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/region/resources.powersync.svelte'),
    typeof import('$lib/entities/region/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/rolePermission/resources.powersync.svelte'),
    typeof import('$lib/entities/rolePermission/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/route/resources.powersync.svelte'),
    typeof import('$lib/entities/route/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/topo/resources.powersync.svelte'),
    typeof import('$lib/entities/topo/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/user/resources.powersync.svelte'),
    typeof import('$lib/entities/user/resources.svelte')
  >,
  Fits<
    typeof import('$lib/entities/favorite/save.powersync.svelte'),
    typeof import('$lib/entities/favorite/save.svelte')
  >,
  Fits<
    typeof import('$lib/components/EntitySearch/search.powersync.svelte'),
    typeof import('$lib/components/EntitySearch/search.svelte')
  >,
  Fits<typeof import('$lib/map/explore/exploreData.powersync.svelte'), typeof import('$lib/map/explore/exploreData.svelte')>,
  Fits<typeof import('$lib/state/engine.powersync'), typeof import('$lib/state/engine')>,
]

type Fits<Twin extends Zero, Zero> = [Twin, Zero]
