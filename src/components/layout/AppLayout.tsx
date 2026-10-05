import { Outlet } from 'react-router-dom';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTranslation } from '@/i18n';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';

/**
 * The application shell: sidebar, header, scrolling content region, and the
 * mobile bottom bar. Every routed page renders into the <Outlet/>.
 */
export function AppLayout() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const mobileNav = useDisclosure(false);
  const [collapsed, setCollapsed] = useLocalStorage('app.sidebar.collapsed', false);

  return (
    <div className="flex h-svh overflow-hidden bg-ink-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-toast focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:text-base focus:font-medium focus:shadow-md"
      >
        {t('nav.skipToContent')}
      </a>

      <Sidebar
        collapsed={isDesktop ? collapsed : false}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileNav.isOpen}
        onCloseMobile={mobileNav.close}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Header onOpenMobileNav={mobileNav.open} />

        {/* Grows with the page and never shrinks below it. With min-h-0 a long
            page squeezed main to the space left over, its content spilled past
            the end, and the sticky mobile nav — laid out after main — sat on
            top of the last rows (the receivables Collect button among them). */}
        <main id="main-content" className="flex-1 shrink-0 px-3 py-3 sm:px-4 sm:py-4">
          <div className="mx-auto h-full w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>

        <MobileNav />
      </div>
    </div>
  );
}
