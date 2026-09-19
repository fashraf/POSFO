import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui';
import { useTranslation } from '@/i18n';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400"
      >
        <Compass className="h-5 w-5" />
      </span>

      <div className="max-w-md space-y-1.5">
        <p className="numeric text-sm font-semibold text-ink-400">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t('notFound.title')}</h1>
        <p className="text-md text-ink-500">{t('notFound.description')}</p>
      </div>

      <Link to="/">
        <Button variant="outline">{t('notFound.action')}</Button>
      </Link>
    </div>
  );
}
