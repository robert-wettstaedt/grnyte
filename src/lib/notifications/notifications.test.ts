import * as schema from '$lib/db/schema'
import type { Notification, TranslatedNotification } from '$lib/notifications'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the environment variables before importing actual code
vi.mock('$env/static/private', () => ({
  // The private key must be URL-safe base64 encoded and 32 bytes when decoded
  PRIVATE_VAPID_KEY: 'TN1HFMcpPsBelJOR8NN7U4216ZKpV0TDKDEFj-HcBRw',
}))

vi.mock('$env/static/public', () => ({
  // The public key must be URL-safe base64 encoded and 65 bytes when decoded
  PUBLIC_VAPID_KEY: 'BLGhkhDC5K6IaR6PiMcpZ9-FtKUQmotciMCOv9L7XGFZeJ1JGqj9Z5tFK-z4aPgsgLjP1FxYGdJvYwVkvC4hXiQ',
  PUBLIC_TOPO_EMAIL: 'test@example.com',
}))

// Mock webpush module
vi.mock('web-push', () => {
  class MockWebPushError extends Error {
    statusCode: number
    headers: object
    body: string
    endpoint: string

    constructor(message: string, statusCode: number, headers: object, body: string, endpoint: string) {
      super(message)
      this.statusCode = statusCode
      this.headers = headers
      this.body = body
      this.endpoint = endpoint
    }
  }

  const mockSendNotification = vi.fn().mockImplementation((subscription, payload) => {
    // Just return a resolved promise for successful cases
    return Promise.resolve()
  })

  const mockModule = {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
    WebPushError: MockWebPushError,
  }
  return {
    default: mockModule,
    setVapidDetails: mockModule.setVapidDetails,
    sendNotification: mockModule.sendNotification,
    WebPushError: MockWebPushError,
  }
})

// Import the actual functions AFTER all mocks are set up
import {
  getGradeTemplateString,
  replaceGradeTemplateWithValue,
  sendNotificationToSubscription,
  sendNotificationsToAllSubscriptions,
} from '$lib/notifications/notifications.server'

// Import the mocked module to get access to the mock functions
import webpush from 'web-push'
const mockSendNotification = webpush.sendNotification as unknown as ReturnType<typeof vi.fn>
const { WebPushError } = webpush

// Mock database functions for tests
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()
const mockSet = vi.fn()
const mockWhere = vi.fn()
const mockDelete = vi.fn()

// Setup mock chains properly
mockUpdate.mockReturnValue({ set: mockSet })
mockSet.mockReturnValue({ where: mockWhere })
mockDelete.mockReturnValue({ where: mockWhere })
mockWhere.mockResolvedValue(undefined)

// Sample data for tests
const mockTranslatedNotification: TranslatedNotification = {
  title: { de: 'Test notification with {grade: 10}', en: 'Test notification with {grade: 10}' },
  body: { de: 'Test body', en: 'Test body' },
  userId: 1,
  type: 'ascent',
  tag: 'test-tag',
  data: { pathname: '/test' },
}

const mockNotification: Notification = {
  userId: 1,
  type: 'ascent',
  tag: 'test-tag',
  data: { pathname: '/test' },
  body: 'Test body',
  title: 'Test notification with {grade: 10}',
}

const mockSubscription: schema.PushSubscription = {
  id: 1,
  userFk: 2,
  authUserFk: 'auth-user-123',
  endpoint: 'https://example.com/push',
  expirationTime: null,
  p256dh: 'BIHxR0qPmtTMaGQSgZCJRNXyQGqCv_1pP9xkQOHH-dJKXWADm2S0HMHbqYTUVhqBXTsH0FACgGJ3HGHWvyIkXPI',
  auth: 'LHG-2DcCR0elNAH7Qr2cBg',
  lang: 'en',
}

describe('Notifications Server Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getGradeTemplateString', () => {
    it('should generate a grade template string with the given grade FK', () => {
      const result = getGradeTemplateString(10)
      expect(result).toBe('{grade: 10}')
    })
  })

  describe('replaceGradeTemplateWithValue', () => {
    const mockGrades = [
      { id: 1, FB: '4A', V: 'V0' },
      { id: 2, FB: '5A', V: 'V1' },
      { id: 3, FB: '6A', V: 'V2' },
    ]

    it('should replace grade template with FB grade by default', () => {
      const title = { de: 'Test route {grade: 2}', en: 'Test route {grade: 2}' }
      const result = replaceGradeTemplateWithValue(title, mockGrades)
      expect(result.en).toBe('Test route 5A')
    })

    it('should replace grade template with V grade when specified', () => {
      const title = { de: 'Test route {grade: 3}', en: 'Test route {grade: 3}' }
      const result = replaceGradeTemplateWithValue(title, mockGrades, 'V')
      expect(result.en).toBe('Test route V2')
    })

    it('should handle multiple grade templates in one string', () => {
      const title = { de: 'Compare {grade: 1} with {grade: 2}', en: 'Compare {grade: 1} with {grade: 2}' }
      const result = replaceGradeTemplateWithValue(title, mockGrades)
      expect(result.en).toBe('Compare 4A with 5A')
    })

    it('should handle non-existent grade IDs', () => {
      const title = { de: 'Test route {grade: 999}', en: 'Test route {grade: 999}' }
      const result = replaceGradeTemplateWithValue(title, mockGrades)
      expect(result.en).toBe('Test route ')
    })

    it('should not modify strings without grade templates', () => {
      const title = { de: 'Test route without grade', en: 'Test route without grade' }
      const result = replaceGradeTemplateWithValue(title, mockGrades)
      expect(result.en).toBe('Test route without grade')
    })
  })

  describe('sendNotificationToSubscription', () => {
    it('should call webpush.sendNotification with correct parameters', async () => {
      await sendNotificationToSubscription(mockTranslatedNotification, mockSubscription)

      expect(mockSendNotification).toHaveBeenCalledWith(
        {
          endpoint: mockSubscription.endpoint,
          keys: {
            auth: mockSubscription.auth,
            p256dh: mockSubscription.p256dh,
          },
          expirationTime: mockSubscription.expirationTime,
        },
        JSON.stringify(mockNotification),
      )
    })

    it('should throw if webpush.sendNotification throws', async () => {
      mockSendNotification.mockRejectedValueOnce(new Error('Push error'))

      await expect(sendNotificationToSubscription(mockTranslatedNotification, mockSubscription)).rejects.toThrow(
        'Push error',
      )
    })
  })

  describe('sendNotificationsToAllSubscriptions', () => {
    const mockDb = {
      query: {
        pushSubscriptions: { findMany: mockFindMany },
        userSettings: { findMany: mockFindMany },
        grades: { findMany: mockFindMany },
      },
      update: mockUpdate,
      delete: mockDelete,
    } as unknown as PostgresJsDatabase<typeof schema>

    // Mock data
    const mockSubscriptions: schema.PushSubscription[] = [
      { ...mockSubscription, id: 1, userFk: 2 },
      { ...mockSubscription, id: 2, userFk: 3 },
    ]

    const mockUserSettings = [
      {
        id: 1,
        userFk: 2,
        notifyNewAscents: true,
        notifyNewUsers: true,
        notifyModerations: true,
        gradingScale: 'FB',
      },
      {
        id: 2,
        userFk: 3,
        notifyNewAscents: false,
        notifyNewUsers: true,
        notifyModerations: false,
        gradingScale: 'UIAA',
      },
    ]

    const mockGrades = [{ id: 10, FB: '6A', UIAA: 'VII' }]

    const mockNotifications: TranslatedNotification[] = [
      {
        ...mockTranslatedNotification,
        userId: 1,
        type: 'ascent',
      },
      {
        ...mockTranslatedNotification,
        userId: 4,
        type: 'user',
        title: { de: 'Another notification', en: 'Another notification' },
      },
    ]

    beforeEach(() => {
      // Reset mocks for each test
      vi.resetAllMocks()

      // Setup mock chains properly
      mockUpdate.mockReturnValue({ set: mockSet })
      mockSet.mockReturnValue({ where: mockWhere })
      mockDelete.mockReturnValue({ where: mockWhere })
      mockWhere.mockResolvedValue(undefined)

      // Setup default mock returns
      mockFindMany.mockImplementation((args) => {
        if (args?.where?.in?.pushSubscriptions?.id) return mockSubscriptions
        if (args?.where?.eq?.userSettings?.userFk) return mockUserSettings
        if (args?.where?.in?.grades?.id) return mockGrades

        // Return based on the call order
        if (mockFindMany.mock.calls.length === 1) return mockSubscriptions
        if (mockFindMany.mock.calls.length === 2) return mockUserSettings
        if (mockFindMany.mock.calls.length === 3) return mockGrades
        return []
      })
    })

    it('should send notifications to eligible subscriptions', async () => {
      // Setup mocks
      mockFindMany.mockImplementationOnce(() => mockSubscriptions)
      mockFindMany.mockImplementationOnce(() => mockUserSettings)
      mockFindMany.mockImplementationOnce(() => mockGrades)

      await sendNotificationsToAllSubscriptions(mockNotifications, mockDb)

      // First user should receive both notifications
      // Second user should only receive the user notification type
      expect(mockSendNotification).toHaveBeenCalledTimes(3)
    })

    it('should replace grade templates in notification titles', async () => {
      // Setup mocks to ensure we only have these two subscriptions
      mockFindMany.mockImplementationOnce(() => [
        { ...mockSubscription, id: 1, userFk: 2 },
        { ...mockSubscription, id: 2, userFk: 3 },
      ])

      // Only return settings for both users
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: 2,
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
        {
          id: 2,
          userFk: 3,
          notifyNewAscents: true, // <-- Make sure user 3 also gets ascent notifications
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'UIAA',
        },
      ])

      mockFindMany.mockImplementationOnce(() => [{ id: 10, FB: '6A', UIAA: 'VII' }])

      const notificationWithGrade: TranslatedNotification = {
        ...mockTranslatedNotification,
        body: { de: 'Test notification with {grade: 10}', en: 'Test notification with {grade: 10}' },
        userId: 4, // Different from subscription userFks
      }

      await sendNotificationsToAllSubscriptions([notificationWithGrade], mockDb)

      // Check for correct grade substitution
      expect(mockSendNotification).toHaveBeenCalledTimes(2)

      // First user (FB grading scale) should see 6A
      expect(mockSendNotification.mock.calls[0][1]).toContain('Test notification with 6A')

      // Second user (UIAA grading scale) should see VII
      expect(mockSendNotification.mock.calls[1][1]).toContain('Test notification with VII')
    })

    it('should not send notification to the user who created it', async () => {
      // Setup mocks
      mockFindMany.mockImplementationOnce(() => [{ ...mockSubscription, userFk: 1 }])
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: 1,
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      await sendNotificationsToAllSubscriptions([{ ...mockTranslatedNotification, userId: 1 }], mockDb)

      // Should not send to user who created the notification
      expect(mockSendNotification).not.toHaveBeenCalled()
    })

    it('should respect user notification preferences', async () => {
      // Setup mocks with user who only wants user notifications
      mockFindMany.mockImplementationOnce(() => [{ ...mockSubscription, userFk: 3 }])
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: 3,
          notifyNewAscents: false, // This should prevent ascent notifications
          notifyNewUsers: true,
          notifyModerations: false,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      await sendNotificationsToAllSubscriptions(
        [
          { ...mockTranslatedNotification, type: 'ascent', userId: 1 },
          { ...mockTranslatedNotification, type: 'user', userId: 1 },
          { ...mockTranslatedNotification, type: 'moderate', userId: 1 },
        ],
        mockDb,
      )

      // Should only send the user notification (not ascent or moderate)
      expect(mockSendNotification).toHaveBeenCalledTimes(1)
      expect(mockSendNotification).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('"type":"user"'))
    })

    it('should skip users with no settings', async () => {
      // Setup mocks
      mockFindMany.mockImplementationOnce(() => mockSubscriptions)
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: 2, // Only settings for user 2, none for user 3
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      await sendNotificationsToAllSubscriptions(mockNotifications, mockDb)

      // Should only send to user 2 (user 3 has no settings)
      expect(mockSendNotification).toHaveBeenCalledTimes(2)
    })

    it('should handle 301 WebPushError by updating subscription endpoint', async () => {
      // Reset mocks
      vi.resetAllMocks()

      // Setup mock chains properly
      mockUpdate.mockReturnValue({ set: mockSet })
      mockSet.mockReturnValue({ where: mockWhere })
      mockDelete.mockReturnValue({ where: mockWhere })
      mockWhere.mockResolvedValue(undefined)

      // Setup mock behavior for this test
      mockFindMany.mockImplementationOnce(() => [mockSubscription])
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: mockSubscription.userFk,
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      // Mock webpush throwing a 301 error
      mockSendNotification.mockRejectedValueOnce(
        new WebPushError('Moved Permanently', 301, {}, '', 'https://new-endpoint.com'),
      )

      await sendNotificationsToAllSubscriptions([{ ...mockTranslatedNotification, userId: 1 }], mockDb)

      // Should update the subscription with the new endpoint
      expect(mockUpdate).toHaveBeenCalledWith(schema.pushSubscriptions)
      expect(mockSet).toHaveBeenCalledWith({ endpoint: 'https://new-endpoint.com' })
      expect(mockWhere).toHaveBeenCalledWith(eq(schema.pushSubscriptions.id, mockSubscription.id))
    })

    it('should handle 404/410 WebPushError by deleting subscription', async () => {
      // Reset mocks
      vi.resetAllMocks()

      // Setup mock chains properly
      mockUpdate.mockReturnValue({ set: mockSet })
      mockSet.mockReturnValue({ where: mockWhere })
      mockDelete.mockReturnValue({ where: mockWhere })
      mockWhere.mockResolvedValue(undefined)

      // Setup mock behavior for this test
      mockFindMany.mockImplementationOnce(() => [mockSubscription])
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: mockSubscription.userFk,
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      // Mock webpush throwing a 404 error
      mockSendNotification.mockRejectedValueOnce(new WebPushError('Not Found', 404, {}, '', ''))

      await sendNotificationsToAllSubscriptions([{ ...mockTranslatedNotification, userId: 1 }], mockDb)

      // Should delete the subscription
      expect(mockDelete).toHaveBeenCalledWith(schema.pushSubscriptions)
      expect(mockWhere).toHaveBeenCalledWith(eq(schema.pushSubscriptions.id, mockSubscription.id))
    })

    it('should log other errors to console', async () => {
      // Setup mocks
      mockFindMany.mockImplementationOnce(() => [mockSubscription])
      mockFindMany.mockImplementationOnce(() => [
        {
          id: 1,
          userFk: mockSubscription.userFk,
          notifyNewAscents: true,
          notifyNewUsers: true,
          notifyModerations: true,
          gradingScale: 'FB',
        },
      ])
      mockFindMany.mockImplementationOnce(() => mockGrades)

      // Mock webpush throwing a generic error
      const genericError = new Error('Generic error')
      mockSendNotification.mockRejectedValueOnce(genericError)

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await sendNotificationsToAllSubscriptions([{ ...mockTranslatedNotification, userId: 1 }], mockDb)

      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith(genericError)
    })
  })
})
