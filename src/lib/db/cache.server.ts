import { DATABASE_URL } from '$env/static/private'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { config } from '$lib/config'
import KeyvPostgres from '@keyv/postgres'
import Keyv from 'keyv'

export const keyvPostgres = new KeyvPostgres({ uri: DATABASE_URL })
export const keyv = new Keyv({ store: keyvPostgres, ttl: config.cache.ttl, namespace: PUBLIC_APPLICATION_NAME })
