import { apiAuthService } from './apiAuthService';

/**
 * The single auth entry point.
 *
 * Everything above imports from here and never from the implementation, so
 * the sign-in flow has one place to change.
 */
export const authService = apiAuthService;
