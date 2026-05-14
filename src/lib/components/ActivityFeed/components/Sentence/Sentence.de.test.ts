import type { Row, RowWithRelations } from '$lib/db/zero'
import { renderWithI18n } from '$lib/test/renderWithI18n'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityDTO, AreaEntity, AscentEntity, BlockEntity, FileEntity, RouteEntity, UserEntity } from '../..'
import Sentence from './Sentence.svelte'

// Mock RouteRating component
vi.mock('$lib/components/RouteRating', () => ({
  default: vi.fn(),
}))

// Mock SvelteKit $app/state page store used by RouteNameLoader
vi.mock('$app/state', () => ({
  page: {
    data: {
      z: {
        q: vi.fn(() => ({ data: [] })),
      },
    },
  },
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  compareAsc: vi.fn(() => 0),
  format: vi.fn((date: Date) => date.toISOString().slice(0, 10)),
  formatDistance: vi.fn(() => 'vor 2 Tagen'),
}))

// Mock diff - default returns mixed changes
vi.mock('diff', () => ({
  diffWords: vi.fn(() => [
    { value: 'old text', removed: true },
    { value: ' ', added: false, removed: false },
    { value: 'new text', added: true },
  ]),
}))

// Mock pageState
vi.mock('$lib/components/Layout', () => ({
  pageState: {
    user: { id: 1, username: 'currentuser', authUserFk: 'auth-1' },
    grades: [
      { id: 1, FB: '6a', V: 'V3' },
      { id: 2, FB: '6b', V: 'V4' },
    ],
    gradingScale: 'FB' as const,
    tags: [],
    userPermissions: undefined,
    userRegions: [],
    userRole: undefined,
  },
}))

// Helper function to normalize text content (collapse whitespace)
function getTextContent(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// Base user object for tests
function createUser(overrides: Partial<Row<'users'>> = {}): Row<'users'> {
  return {
    id: 1,
    username: 'testuser',
    authUserFk: 'auth-1',
    firstAscensionistFk: null,
    userSettingsFk: null,
    createdAt: Date.now(),
    ...overrides,
  }
}

// Base ascent object for tests
function createAscent(
  overrides: Partial<RowWithRelations<'ascents', { author: true; files: true }>> = {},
): RowWithRelations<'ascents', { author: true; files: true }> {
  return {
    id: 1,
    type: 'flash',
    regionFk: 1,
    createdBy: 2,
    routeFk: 1,
    createdAt: Date.now(),
    dateTime: null,
    humidity: null,
    notes: null,
    rating: null,
    temperature: null,
    gradeFk: null,
    author: undefined,
    files: [],
    ...overrides,
  }
}

// Base route object for tests
function createRoute(overrides: Partial<Row<'routes'>> = {}): Row<'routes'> {
  return {
    id: 1,
    name: 'Test Route',
    slug: 'test-route',
    regionFk: 1,
    createdBy: 1,
    blockFk: 1,
    createdAt: Date.now(),
    description: null,
    rating: null,
    firstAscentYear: null,
    userRating: null,
    areaFks: null,
    areaIds: null,
    externalResourcesFk: null,
    gradeFk: null,
    userGradeFk: null,
    ...overrides,
  }
}

// Base file object for tests
function createFile(overrides: Partial<Row<'files'>> = {}): Row<'files'> {
  return {
    id: 'file-1',
    path: '/uploads/test.jpg',
    regionFk: 1,
    visibility: 'private',
    areaFk: null,
    ascentFk: null,
    blockFk: null,
    bunnyStreamFk: null,
    routeFk: null,
    ...overrides,
  }
}

// Helper to create base activity
function createBaseActivity(overrides: Partial<ActivityDTO> = {}): ActivityDTO {
  return {
    id: 1,
    createdAt: Date.now(),
    regionFk: 1,
    type: 'created',
    userFk: 1,
    entityId: '1',
    entityType: 'area',
    parentEntityId: null,
    parentEntityType: null,
    columnName: null,
    metadata: null,
    oldValue: null,
    newValue: null,
    notified: false,
    user: createUser(),
    entityName: 'Test Entity',
    entity: { type: 'area', object: null },
    parentEntityName: null,
    parentEntity: undefined,
    region: { id: 1, name: 'Test Region', createdBy: 1, createdAt: Date.now(), maxMembers: 10, settings: null },
    ...overrides,
  }
}

describe('Sentence.svelte (de/du)', () => {
  beforeAll(() => {
    // Ensure mocks are set up
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ascent activities (created)', () => {
    it('renders flash ascent sentence', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({
          type: 'flash',
          author: createUser({ id: 2, username: 'climber', authUserFk: 'auth-2' }),
        }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geflasht')
    })

    it('renders send ascent sentence', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'send' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geschafft')
    })

    it('renders repeat ascent sentence', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'repeat' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat wiederholt')
    })

    it('renders attempt ascent sentence', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'attempt' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat versucht')
    })

    it('renders ascent with parent route entity', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash' }),
      }

      const parentEntity: RouteEntity = {
        type: 'route',
        object: createRoute({ name: 'Test Route' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
        parentEntityType: 'route',
        parentEntityId: '1',
        parentEntityName: 'Test Route',
        parentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      const text = getTextContent(container)
      expect(text).toBe('hat Test Route geflasht')
    })

    it('renders ascent with parent entity name (not route type)', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'send' }),
      }

      const parentEntity: AreaEntity = {
        type: 'area',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
        parentEntityType: 'area',
        parentEntityId: '1',
        parentEntityName: 'Test Area',
        parentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat Test Area geschafft')
    })

    it('renders ascent with breadcrumbs', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash' }),
      }

      const parentEntity: AreaEntity = {
        type: 'area',
        object: null,
        breadcrumb: ['Region', 'Sector'],
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
        parentEntityType: 'area',
        parentEntityId: '1',
        parentEntityName: 'Test Area',
        parentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withBreadcrumbs: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat Test Area geflasht in Region >Sector')
    })

    it('renders ascent with grade opinion', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash', gradeFk: 1 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geflasht Persönliche Meinung: 6a')
    })

    it('renders ascent with rating opinion', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'send', rating: 4 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geschafft Persönliche Meinung:')
    })

    it('renders ascent with temperature and humidity', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash', temperature: 18, humidity: 65 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geflasht 18°C 65%')
    })

    it('renders ascent with temperature only', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'send', temperature: 22 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geschafft 22°C')
    })

    it('renders ascent with different date (shows relative time)', async () => {
      const ascentDateTime = new Date('2024-01-15').getTime()
      const createdAt = new Date('2024-01-20').getTime()

      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash', createdAt, dateTime: ascentDateTime }),
      }

      // Mock compareAsc to return non-zero for different dates
      const { compareAsc } = await import('date-fns')
      vi.mocked(compareAsc).mockReturnValueOnce(-1)

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
        createdAt,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geflasht vor 2 Tagen')
    })
  })

  describe('with withDetails prop', () => {
    it('renders username with link when withDetails is true', () => {
      const activity = createBaseActivity({
        type: 'created',
        entityType: 'area',
        entity: { type: 'area', object: null },
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      const link = container.querySelector('a[href="/users/testuser"]')
      expect(link).toBeTruthy()
      expect(link?.textContent).toBe('testuser')
    })

    it('renders "Someone" when user is null and withDetails is true', () => {
      const activity = createBaseActivity({
        type: 'created',
        entityType: 'area',
        entity: { type: 'area', object: null },
        user: undefined,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toContain('Jemand')
    })
  })

  describe('user role activities', () => {
    it('renders user role created sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: createUser({ id: 2, username: 'approveduser', authUserFk: 'auth-2' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat approveduser für die Region Test Region genehmigt')
    })

    it('renders user role created sentence with null user', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat einen Nutzer für die Region Test Region genehmigt')
    })

    it('renders user role updated sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: createUser({ id: 2, username: 'updateduser', authUserFk: 'auth-2' }),
      }

      const activity = createBaseActivity({
        type: 'updated',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
        newValue: 'admin',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe(
        'testuser hat die Rolle von updateduser in der Region Test Region auf admin aktualisiert',
      )
    })

    it('renders user role updated sentence with null user', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'updated',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
        newValue: 'maintainer',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe(
        'testuser hat die Rolle eines Nutzers in der Region Test Region auf maintainer aktualisiert',
      )
    })

    it('renders user role deleted sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: createUser({ id: 2, username: 'removeduser', authUserFk: 'auth-2' }),
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat removeduser aus der Region Test Region entfernt')
    })

    it('renders user role deleted sentence with null user', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat einen Nutzer aus der Region Test Region entfernt')
    })

    it('renders user role created without region', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: createUser({ id: 2, username: 'newuser', authUserFk: 'auth-2' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'user',
        entity: userEntity,
        columnName: 'role',
        region: undefined,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat newuser genehmigt')
    })
  })

  describe('user invitation activities', () => {
    it('renders invitation created sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'user',
        entity: userEntity,
        columnName: 'invitation',
        newValue: 'invited@example.com',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat invited@example.com in die Region Test Region eingeladen')
    })

    it('renders invitation accepted sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'updated',
        entityType: 'user',
        entity: userEntity,
        columnName: 'invitation',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe(
        'testuser hat die Einladung angenommen, der Region Test Region beizutreten',
      )
    })

    it('renders invitation deleted sentence', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'user',
        entity: userEntity,
        columnName: 'invitation',
        newValue: 'removed@example.com',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe(
        'testuser hat die Einladung an removed@example.com aus der Region Test Region entfernt',
      )
    })

    it('renders invitation created without region', () => {
      const userEntity: UserEntity = {
        type: 'user',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'user',
        entity: userEntity,
        columnName: 'invitation',
        newValue: 'test@example.com',
        region: undefined,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat test@example.com eingeladen')
    })
  })

  describe('favorite activities', () => {
    it('renders favorite created sentence for route', () => {
      const routeEntity: RouteEntity = {
        type: 'route',
        object: createRoute({ name: 'Favorite Route', slug: 'favorite-route' }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'route',
        entity: routeEntity,
        entityId: '1',
        entityName: 'Favorite Route',
        columnName: 'favorite',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat Favorite Route zu seinen/ihren Favoriten hinzugefügt')
    })

    it('renders favorite created sentence for non-route entity', () => {
      const areaEntity: AreaEntity = {
        type: 'area',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'area',
        entity: areaEntity,
        entityId: '1',
        entityName: 'Favorite Area',
        columnName: 'favorite',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat Favorite Area zu seinen/ihren Favoriten hinzugefügt')
    })

    it('renders favorite deleted sentence for route', () => {
      const routeEntity: RouteEntity = {
        type: 'route',
        object: createRoute({ name: 'Unfavorite Route', slug: 'unfavorite-route' }),
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'route',
        entity: routeEntity,
        entityId: '1',
        entityName: 'Unfavorite Route',
        columnName: 'favorite',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat Unfavorite Route aus seinen/ihren Favoriten entfernt')
    })

    it('renders favorite deleted sentence for non-route entity', () => {
      const blockEntity: BlockEntity = {
        type: 'block',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'block',
        entity: blockEntity,
        entityId: '1',
        entityName: 'Unfavorite Block',
        columnName: 'favorite',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('testuser hat Unfavorite Block aus seinen/ihren Favoriten entfernt')
    })
  })

  describe('generic entity activities', () => {
    describe('area entity', () => {
      it('renders created area sentence', () => {
        const areaEntity: AreaEntity = {
          type: 'area',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'created',
          entityType: 'area',
          entity: areaEntity,
          entityName: 'New Area',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat ein Gebiet New Area erstellt')
      })

      it('renders updated area name sentence', () => {
        const areaEntity: AreaEntity = {
          type: 'area',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'area',
          entity: areaEntity,
          entityName: 'Updated Area',
          columnName: 'name',
          oldValue: 'Old Name',
          newValue: 'New Name',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat den Namen des Gebiets Updated Area aktualisiert old text new text',
        )
      })

      it('renders deleted area sentence', () => {
        const areaEntity: AreaEntity = {
          type: 'area',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'deleted',
          entityType: 'area',
          entity: areaEntity,
          entityName: 'Deleted Area',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat ein Gebiet Deleted Area gelöscht')
      })
    })

    describe('block entity', () => {
      it('renders created block sentence', () => {
        const blockEntity: BlockEntity = {
          type: 'block',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'created',
          entityType: 'block',
          entity: blockEntity,
          entityName: 'New Block',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat einen Block New Block erstellt')
      })

      it('renders updated block name sentence', () => {
        const blockEntity: BlockEntity = {
          type: 'block',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'block',
          entity: blockEntity,
          entityName: 'Test Block',
          columnName: 'name',
          oldValue: 'Old name',
          newValue: 'New name',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat den Namen des Blocks Test Block aktualisiert old text new text',
        )
      })
    })

    describe('route entity', () => {
      it('renders created route sentence', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: createRoute({ name: 'New Route', slug: 'new-route' }),
        }

        const activity = createBaseActivity({
          type: 'created',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'New Route',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat eine Route New Route erstellt')
      })

      it('renders updated route grade sentence', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: createRoute({ name: 'Graded Route', slug: 'graded-route', gradeFk: 2 }),
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Graded Route',
          columnName: 'gradeFk',
          oldValue: '1',
          newValue: '2',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat die Schwierigkeit der Route 6b Graded Route aktualisiert 6a 6b',
        )
      })

      it('renders updated route grade with only newValue (no oldValue)', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Graded Route',
          columnName: 'gradeFk',
          oldValue: null,
          newValue: '2',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat die Schwierigkeit der Route Graded Route aktualisiert 6b')
      })

      it('renders updated route grade with only oldValue (no newValue)', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Graded Route',
          columnName: 'gradeFk',
          oldValue: '1',
          newValue: null,
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat die Schwierigkeit der Route Graded Route aktualisiert 6a')
      })

      it('renders updated route rating sentence', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Rated Route',
          columnName: 'rating',
          oldValue: '3',
          newValue: '5',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat die Bewertung der Route Rated Route aktualisiert')
      })

      it('renders updated route tags sentence', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Tagged Route',
          columnName: 'tags',
          oldValue: 'slab',
          newValue: 'slab, crimpy',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat die Tags der Route Tagged Route aktualisiert old text new text',
        )
      })

      it('renders updated route first ascent sentence', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'FA Route',
          columnName: 'first ascent',
          oldValue: 'John Doe',
          newValue: 'Jane Smith',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat die Erstbegehung der Route FA Route aktualisiert old text new text',
        )
      })
    })

    describe('file entity', () => {
      it('renders uploaded file sentence with columnName = null', () => {
        const fileEntity: FileEntity = {
          type: 'file',
          object: createFile(),
        }

        const activity = createBaseActivity({
          type: 'uploaded',
          entityType: 'file',
          entity: fileEntity,
          entityName: 'test.jpg',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat eine Datei hochgeladen')
      })

      it('renders uploaded file sentence with columnName = topo image', () => {
        const fileEntity: FileEntity = {
          type: 'file',
          object: createFile(),
        }

        const activity = createBaseActivity({
          type: 'uploaded',
          entityType: 'file',
          entity: fileEntity,
          entityName: 'test.jpg',
          columnName: 'topo image',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat ein Topo Bild hochgeladen')
      })

      it('renders uploaded file sentence with columnName = file', () => {
        const fileEntity: FileEntity = {
          type: 'file',
          object: createFile(),
        }

        const activity = createBaseActivity({
          type: 'uploaded',
          entityType: 'file',
          entity: fileEntity,
          entityName: 'test.jpg',
          columnName: 'file',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat eine Datei hochgeladen')
      })
    })

    describe('ascent entity (non-created type)', () => {
      it('renders updated ascent notes sentence (own ascent)', () => {
        const ascentEntity: AscentEntity = {
          type: 'ascent',
          object: createAscent({
            type: 'flash',
            createdBy: 1, // Same as currentuser id in mock
            notes: 'Updated notes',
          }),
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'ascent',
          entity: ascentEntity,
          entityName: 'Test Ascent',
          columnName: 'notes',
          oldValue: 'Old notes',
          newValue: 'New notes',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat die Notizen seiner/ihrer Begehung von Test Ascent aktualisiert old text new text',
        )
      })

      it('renders updated ascent notes sentence (other user ascent)', () => {
        const ascentEntity: AscentEntity = {
          type: 'ascent',
          object: createAscent({
            type: 'flash',
            createdBy: 2, // Different from currentuser id
            notes: 'Updated notes',
            author: createUser({ id: 2, username: 'otheruser', authUserFk: 'auth-2' }),
          }),
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'ascent',
          entity: ascentEntity,
          entityName: 'Test Ascent',
          columnName: 'notes',
          oldValue: 'Old notes',
          newValue: 'New notes',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          "testuser hat die Notizen von otheruser's Begehung von Test Ascent aktualisiert old text new text",
        )
      })

      it('renders deleted ascent sentence', () => {
        const ascentEntity: AscentEntity = {
          type: 'ascent',
          object: createAscent({ type: 'send', createdBy: 2 }),
        }

        const activity = createBaseActivity({
          type: 'deleted',
          entityType: 'ascent',
          entity: ascentEntity,
          entityName: 'Deleted Ascent',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat eine Begehung von Deleted Ascent gelöscht')
      })
    })

    describe('with parent entity', () => {
      it('renders entity with parent entity and breadcrumbs', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const parentEntity: BlockEntity = {
          type: 'block',
          object: null,
          breadcrumb: ['Area A', 'Sector B'],
        }

        const activity = createBaseActivity({
          type: 'created',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'New Route',
          parentEntityType: 'block',
          parentEntityId: '1',
          parentEntityName: 'Parent Block',
          parentEntity,
        })

        const { container } = renderWithI18n(Sentence, {
          props: { activity, withDetails: true, withBreadcrumbs: true },
          lang: 'de',
        })
        expect(getTextContent(container)).toBe(
          'testuser hat eine Route New Route erstellt in Area A >Sector B > Parent Block',
        )
      })

      it('renders entity with parent route entity', () => {
        const ascentEntity: AscentEntity = {
          type: 'ascent',
          object: null,
        }

        const parentEntity: RouteEntity = {
          type: 'route',
          object: createRoute({ name: 'Parent Route', slug: 'parent-route' }),
          breadcrumb: ['Area'],
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'ascent',
          entity: ascentEntity,
          entityName: 'Test Ascent',
          columnName: 'notes',
          parentEntityType: 'route',
          parentEntityId: '1',
          parentEntityName: 'Parent Route',
          parentEntity,
        })

        const { container } = renderWithI18n(Sentence, {
          props: { activity, withDetails: true, withBreadcrumbs: true },
          lang: 'de',
        })
        expect(getTextContent(container)).toBe(
          'testuser hat die Notizen von einer Begehung von Test Ascent aktualisiert in Area > Parent Route',
        )
      })
    })

    describe('value changes rendering', () => {
      it('renders old value with strikethrough for generic update', () => {
        const areaEntity: AreaEntity = {
          type: 'area',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'area',
          entity: areaEntity,
          entityName: 'Test Area',
          columnName: 'type',
          oldValue: 'crag',
          newValue: 'sector',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe(
          'testuser hat den Typ des Gebiets Test Area aktualisiert "crag" "sector"',
        )
      })

      it('renders only new value when old value is null', () => {
        const blockEntity: BlockEntity = {
          type: 'block',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'block',
          entity: blockEntity,
          entityName: 'Test Block',
          columnName: 'topo',
          oldValue: null,
          newValue: '5',
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat das Topo des Blocks Test Block aktualisiert "5"')
      })

      it('renders only old value when new value is null', () => {
        const routeEntity: RouteEntity = {
          type: 'route',
          object: null,
        }

        const activity = createBaseActivity({
          type: 'updated',
          entityType: 'route',
          entity: routeEntity,
          entityName: 'Test Route',
          columnName: 'topo',
          oldValue: '2020',
          newValue: null,
        })

        const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
        expect(getTextContent(container)).toBe('testuser hat das Topo der Route Test Route aktualisiert "2020"')
      })
    })
  })

  describe('route entity with userGradeFk or userRating', () => {
    it('applies special classes for route with userGradeFk', () => {
      const routeEntity: RouteEntity = {
        type: 'route',
        object: createRoute({ name: 'Graded Route', slug: 'graded-route', userGradeFk: 2 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'route',
        entity: routeEntity,
        entityName: 'Graded Route',
        columnName: 'file',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      const link = container.querySelector('a.-inset-y-px')
      expect(link).toBeTruthy()
    })

    it('applies special classes for route with userRating', () => {
      const routeEntity: RouteEntity = {
        type: 'route',
        object: createRoute({ name: 'Rated Route', slug: 'rated-route', userRating: 4 }),
      }

      const activity = createBaseActivity({
        type: 'deleted',
        entityType: 'route',
        entity: routeEntity,
        entityName: 'Rated Route',
        columnName: 'file',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      const link = container.querySelector('a.-inset-y-px')
      expect(link).toBeTruthy()
    })
  })

  describe('edge cases', () => {
    it('handles activity with no user in withDetails mode', () => {
      const areaEntity: AreaEntity = {
        type: 'area',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'area',
        entity: areaEntity,
        entityName: 'Test Area',
        user: undefined,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('Jemand hat ein Gebiet Test Area erstellt')
    })

    it('handles ascent with null object in created type', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('')
    })

    it('handles multiple breadcrumb items', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'flash' }),
      }

      const parentEntity: AreaEntity = {
        type: 'area',
        object: null,
        breadcrumb: ['Region A', 'Sub Area', 'Sector X'],
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
        parentEntityType: 'area',
        parentEntityId: '1',
        parentEntityName: 'Final Area',
        parentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withBreadcrumbs: true }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat Final Area geflasht in Region A >Sub Area >Sector X')
    })

    it('handles ascent with both grade and rating opinion', () => {
      const ascentEntity: AscentEntity = {
        type: 'ascent',
        object: createAscent({ type: 'send', gradeFk: 2, rating: 5 }),
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'ascent',
        entity: ascentEntity,
      })

      const { container } = renderWithI18n(Sentence, { props: { activity }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat geschafft Persönliche Meinung: 6b')
    })

    it('renders without withDetails prop (no username prefix)', () => {
      const areaEntity: AreaEntity = {
        type: 'area',
        object: null,
      }

      const activity = createBaseActivity({
        type: 'created',
        entityType: 'area',
        entity: areaEntity,
        entityName: 'Test Area',
      })

      const { container } = renderWithI18n(Sentence, { props: { activity, withDetails: false }, lang: 'de' })
      expect(getTextContent(container)).toBe('hat ein Gebiet Test Area erstellt')
    })
  })
})
