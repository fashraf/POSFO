import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { LoadingState } from '@/components/ui';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';
import { ROUTES } from './paths';

/**
 * Routes are code-split so a page's dependencies load only when someone visits
 * it. The dashboard pulls in the charting library, which is large; without this
 * every cashier would download it just to open the till.
 */
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PosPage = lazy(() => import('@/pages/PosPage'));
const SalesPage = lazy(() => import('@/pages/SalesPage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const VendorsPage = lazy(() => import('@/pages/VendorsPage'));
const RestockPage = lazy(() => import('@/pages/inventory/RestockPage'));
const StocktakePage = lazy(() => import('@/pages/inventory/StocktakePage'));
const KitchenPage = lazy(() => import('@/pages/KitchenPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const CompanyProfilePage = lazy(() => import('@/pages/company/CompanyProfilePage'));
const BillBuilderPage = lazy(() => import('@/pages/company/BillBuilderPage'));
const BillsPage = lazy(() => import('@/pages/company/BillsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));
const DevicesPage = lazy(() => import('@/pages/devices/DevicesPage'));
const DeviceFormPage = lazy(() => import('@/pages/devices/DeviceFormPage'));
const DeviceDetailPage = lazy(() => import('@/pages/devices/DeviceDetailPage'));
const ApiPerformancePage = lazy(() => import('@/pages/ApiPerformancePage'));
const FinanceOverviewPage = lazy(() => import('@/pages/finance/FinanceOverviewPage'));
const ExpensesPage = lazy(() => import('@/pages/finance/ExpensesPage'));
const LedgerPage = lazy(() => import('@/pages/finance/LedgerPage'));
const CashPage = lazy(() => import('@/pages/finance/CashPage'));
const SettlementsPage = lazy(() => import('@/pages/finance/SettlementsPage'));
const RecurringPage = lazy(() => import('@/pages/finance/RecurringPage'));
const ReceivablesPage = lazy(() => import('@/pages/finance/ReceivablesPage'));
const CollectionPage = lazy(() => import('@/pages/finance/CollectionPage'));
const PayablesPage = lazy(() => import('@/pages/finance/PayablesPage'));
const PayrollPage = lazy(() => import('@/pages/finance/PayrollPage'));
const CommissionRulesPage = lazy(() => import('@/pages/finance/CommissionRulesPage'));
const PayrollListPage = lazy(() => import('@/pages/finance/PayrollListPage'));
const CommissionSummaryPage = lazy(() => import('@/pages/finance/CommissionSummaryPage'));
const CreditPage = lazy(() => import('@/pages/finance/CreditPage'));
const BranchComparisonPage = lazy(() => import('@/pages/finance/BranchComparisonPage'));
const OpeningBalancesPage = lazy(() => import('@/pages/finance/OpeningBalancesPage'));
const BalancePeriodsPage = lazy(() => import('@/pages/finance/BalancePeriodsPage'));
const BalancePeriodPage = lazy(() => import('@/pages/finance/BalancePeriodPage'));
const ProfitLossPage = lazy(() => import('@/pages/finance/ProfitLossPage'));
const DiscountsPage = lazy(() => import('@/pages/discounts/DiscountsPage'));
const DiscountFormPage = lazy(() => import('@/pages/discounts/DiscountFormPage'));
const UsersPage = lazy(() => import('@/pages/access/UsersPage'));
const UserFormPage = lazy(() => import('@/pages/access/UserFormPage'));
const RolesPage = lazy(() => import('@/pages/access/RolesPage'));
const RoleFormPage = lazy(() => import('@/pages/access/RoleFormPage'));
const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const Login = lazy(() => import('@/features/auth/pages/Login'));
const Register = lazy(() => import('@/features/auth/pages/Register'));
const OtpPage = lazy(() => import('@/features/auth/pages/OtpPage'));
const RegistrationSuccess = lazy(() => import('@/features/auth/pages/RegistrationSuccess'));

/** Every lazy page needs a boundary; this keeps the route table readable. */
function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState className="py-24" />}>{children}</Suspense>;
}

/**
 * Application routes.
 *
 * Public routes sit outside the app shell. Everything else is behind
 * <ProtectedRoute>, so adding a page cannot accidentally leave it unguarded.
 */
export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'login', element: <Page><Login /></Page> },
      { path: 'login/otp', element: <Page><OtpPage purpose="login" /></Page> },
      { path: 'register', element: <Page><Register /></Page> },
      { path: 'register/verify', element: <Page><OtpPage purpose="register" /></Page> },
      { path: 'register/success', element: <Page><RegistrationSuccess /></Page> },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Page><OverviewPage /></Page> },
          { path: ROUTES.dashboard.slice(1), element: <Page><DashboardPage /></Page> },
          { path: ROUTES.pos.slice(1), element: <Page><PosPage /></Page> },
          { path: ROUTES.sales.slice(1), element: <Page><SalesPage /></Page> },
          { path: ROUTES.catalog.slice(1), element: <Page><CatalogPage /></Page> },
          { path: ROUTES.inventory.slice(1), element: <Page><InventoryPage /></Page> },
          { path: ROUTES.vendors.slice(1), element: <Page><VendorsPage /></Page> },
          { path: 'inventory/restock', element: <Page><RestockPage /></Page> },
          { path: ROUTES.stocktake.slice(1), element: <Page><StocktakePage /></Page> },
          { path: ROUTES.kitchen.slice(1), element: <Page><KitchenPage /></Page> },
          { path: ROUTES.profile.slice(1), element: <Page><ProfilePage /></Page> },
          { path: ROUTES.company.slice(1), element: <Page><CompanyProfilePage /></Page> },
          { path: 'bills', element: <Page><BillsPage /></Page> },
          { path: 'bills/new', element: <Page><BillBuilderPage mode="create" /></Page> },
          { path: 'bills/:id/edit', element: <Page><BillBuilderPage mode="edit" /></Page> },
          { path: ROUTES.finance.slice(1), element: <Page><FinanceOverviewPage /></Page> },
          { path: 'finance/expenses', element: <Page><ExpensesPage /></Page> },
          { path: 'finance/ledger', element: <Page><LedgerPage /></Page> },
          { path: 'finance/cash', element: <Page><CashPage /></Page> },
          { path: 'finance/settlements', element: <Page><SettlementsPage /></Page> },
          { path: 'finance/recurring', element: <Page><RecurringPage /></Page> },
          { path: 'finance/receivables', element: <Page><ReceivablesPage /></Page> },
          { path: 'finance/receivables/:id/collect', element: <Page><CollectionPage /></Page> },
          { path: 'finance/payables', element: <Page><PayablesPage /></Page> },
          { path: 'finance/payroll', element: <Page><PayrollListPage /></Page> },
          { path: 'finance/payroll/run', element: <Page><PayrollPage /></Page> },
          { path: 'finance/commission', element: <Page><CommissionSummaryPage /></Page> },
          { path: 'finance/commission-rules', element: <Page><CommissionRulesPage /></Page> },
          { path: 'finance/credit', element: <Page><CreditPage /></Page> },
          { path: 'finance/branches', element: <Page><BranchComparisonPage /></Page> },
          { path: 'finance/opening', element: <Page><OpeningBalancesPage /></Page> },
          { path: 'finance/periods', element: <Page><BalancePeriodsPage /></Page> },
          { path: 'finance/periods/new', element: <Page><BalancePeriodPage mode="create" /></Page> },
          { path: 'finance/periods/:id', element: <Page><BalancePeriodPage mode="view" /></Page> },
          { path: 'finance/profit-loss', element: <Page><ProfitLossPage /></Page> },
          { path: ROUTES.settings.slice(1), element: <Page><SettingsPage /></Page> },
          { path: ROUTES.audit.slice(1), element: <Page><AuditPage /></Page> },
          { path: ROUTES.devices.slice(1), element: <Page><DevicesPage /></Page> },
          { path: ROUTES.deviceNew.slice(1), element: <Page><DeviceFormPage /></Page> },
          { path: ROUTES.deviceDetail.slice(1), element: <Page><DeviceDetailPage /></Page> },
          { path: ROUTES.apiPerformance.slice(1), element: <Page><ApiPerformancePage /></Page> },
          { path: ROUTES.customers.slice(1), element: <Page><CustomersPage /></Page> },
          { path: ROUTES.discounts.slice(1), element: <Page><DiscountsPage /></Page> },
          { path: 'discounts/new', element: <Page><DiscountFormPage mode="create" /></Page> },
          { path: 'discounts/:id/edit', element: <Page><DiscountFormPage mode="edit" /></Page> },
          { path: ROUTES.users.slice(1), element: <Page><UsersPage /></Page> },
          { path: 'users/new', element: <Page><UserFormPage mode="create" /></Page> },
          { path: 'users/:id/edit', element: <Page><UserFormPage mode="edit" /></Page> },
          { path: ROUTES.roles.slice(1), element: <Page><RolesPage /></Page> },
          { path: 'roles/new', element: <Page><RoleFormPage mode="create" /></Page> },
          { path: 'roles/:id/edit', element: <Page><RoleFormPage mode="edit" /></Page> },
          { path: '*', element: <Page><NotFoundPage /></Page> },
        ],
      },
    ],
  },
]);
