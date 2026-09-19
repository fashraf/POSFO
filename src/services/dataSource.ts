import { USE_MOCKS } from '@/config/env';

import { apiCatalogService, apiCategoryService } from './apiCatalogService';
import {
  apiBalancePeriodService,
  apiCashService,
  apiCustomerService,
  apiDiscountService,
  apiExpenseService,
  apiInventoryService,
  apiKitchenService,
  apiLedgerService,
  apiNotificationService,
  apiPayrollService,
  apiRecurringService,
  apiSettingsService,
  apiUserService,
} from './apiDataServices';

/**
 * Where the app reads its data.
 *
 * One flag, one place. `VITE_USE_MOCKS=true` runs the built-in demo data with
 * no backend; `false` reads POSMAIN through the API. Screens import from here
 * and never from either implementation, so neither is special.
 *
 * The mock side is kept deliberately: it is how the UI is worked on when the
 * API is not running, and how the demo runs with no database at all.
 */

export const dataSource = {
  usingMocks: USE_MOCKS,

  catalog: apiCatalogService,
  categories: apiCategoryService,
  customers: apiCustomerService,
  inventory: apiInventoryService,
  expenses: apiExpenseService,
  recurring: apiRecurringService,
  ledger: apiLedgerService,
  cash: apiCashService,
  periods: apiBalancePeriodService,
  payroll: apiPayrollService,
  kitchen: apiKitchenService,
  discounts: apiDiscountService,
  users: apiUserService,
  notifications: apiNotificationService,
  settings: apiSettingsService,
};

export type DataSource = typeof dataSource;
