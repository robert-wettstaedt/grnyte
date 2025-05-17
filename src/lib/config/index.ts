import { up } from 'up-fetch'

export const config = {
  database: {
    maxPoolSize: 10,
    connectionTimeout: 30000,
    debug: process.env.NODE_ENV === 'development',
  },
  files: {
    maxSize: {
      number: 50 * 1024 * 1024,
      human: '50MB',
    },
    folders: {
      topos: '/topos',
      userContent: '/user-content',
    },
    resizing: {
      thumbnail: {
        width: 350,
      },
    },
  },
  routes: {
    defaultName: '<no name>',
  },
  api: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500, // limit each IP to 500 requests per windowMs
    },
  },
  cache: {
    ttl: 1000 * 60 * 60, // 1 hour default TTL
    keys: {
      activityFeed: 'activity_feed',
      areaStats: 'area_stats',
      layoutBlocks: 'layout_blocks',
      layoutBlocksHash: 'layout_blocks_hash',
    },
  },
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'error',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  },
  activityFeed: {
    groupTimeLimit: 3 * 60 * 60 * 1000, // 3 hours in milliseconds
  },
} as const

export type Config = typeof config

export const upfetch = up(fetch)
