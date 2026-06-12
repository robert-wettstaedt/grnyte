import { z } from 'zod'

export const regionSettingsSchema = z.object({
  mapLayers: z
    .array(
      z.object({
        attributions: z.array(z.string()).nullish(),
        minZoom: z.number().nullish(),
        name: z.string(),
        opacity: z.number().nullish(),
        params: z.record(z.string(), z.string()).nullish(),
        type: z.literal('wms'),
        url: z.string(),
      }),
    )
    .default([]),
})
export type RegionSettings = z.infer<typeof regionSettingsSchema>
