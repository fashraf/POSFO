import { USE_MOCKS } from '@/config/env';
import { mockAuthService } from './mockAuthService';
import { apiAuthService } from './apiAuthService';

/**
 * The single auth entry point.
 *
 * Everything above imports from here and never from either implementation, so
 * whether the app is running against mocks or the API is one flag rather than a
 * change spread across the codebase.
 */
export const authService = USE_MOCKS ? mockAuthService : apiAuthService;

export { DEV_OTP, DEMO_ACCOUNTS } from './mockAuthService';

/**
 * Prefilled password for the demo accounts in development.
 *
 * Matches migration 17. It is a convenience for the login form, not a secret —
 * the server still verifies it against a real PBKDF2 hash and rejects anything
 * else.
 */
export const DEV_PASSWORD = '1234';
