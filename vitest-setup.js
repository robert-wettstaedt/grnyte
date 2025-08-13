import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock SvelteKit payload to prevent runtime errors
vi.stubGlobal('__SVELTEKIT_PAYLOAD__', { data: null })
