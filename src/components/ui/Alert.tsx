import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'tip';

const TONES: Record<AlertTone, { wrapper: string; icon: string; title: string; body: string }> = {
  info: {
    wrapper: 'border-info-100 bg-info-50',
    icon: 'text-info-600',
    title: 'text-info-800',
    body: 'text-info-700',
  },
  success: {
    wrapper: 'border-success-100 bg-success-50',
    icon: 'text-success-500',
    title: 'text-success-700',
    body: 'text-success-700',
  },
  warning: {
    wrapper: 'border-warning-100 bg-warning-50',
    icon: 'text-warning-500',
    title: 'text-warning-700',
    body: 'text-warning-700',
  },
  danger: {
    wrapper: 'border-danger-100 bg-danger-50',
    icon: 'text-danger-500',
    title: 'text-danger-700',
    body: 'text-danger-700',
  },
  tip: {
    wrapper: 'border-ink-200 bg-ink-50',
    icon: 'text-ink-400',
    title: 'text-ink-800',
    body: 'text-ink-600',
  },
};

const ICONS: Record<AlertTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  tip: Lightbulb,
};

export interface AlertProps {
  tone?: AlertTone;
  /** Optional bold lead-in. Skip it for a single-sentence note. */
  title?: ReactNode;
  children: ReactNode;
  /** Override the default icon for the tone. */
  icon?: ReactNode;
  /** A link or button, e.g. "Show me how". */
  action?: ReactNode;
  className?: string;
  /** Tighter padding and smaller text, for use inside a form section. */
  compact?: boolean;
}

/**
 * A quiet explanation of what is going on and what to do about it.
 *
 * Deliberately low-contrast: an alert that shouts on every screen trains people
 * to stop reading them. `danger` is the only tone that competes for attention,
 * and it should be rare.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  action,
  className,
  compact = false,
}: AlertProps) {
  const styles = TONES[tone];
  const Icon = ICONS[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        styles.wrapper,
        className,
      )}
    >
      <span aria-hidden className={cn('mt-0.5 shrink-0', styles.icon)}>
        {icon ?? <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        {title && (
          <p className={cn('font-medium', compact ? 'text-sm' : 'text-base', styles.title)}>
            {title}
          </p>
        )}
        <div className={cn(compact ? 'text-xs' : 'text-sm', styles.body)}>{children}</div>
        {action && <div className="pt-1.5">{action}</div>}
      </div>
    </div>
  );
}

/**
 * A one-line "here is what happens next" note. Used at the foot of a wizard
 * step or beside a primary action, where a full alert would be too heavy.
 */
export function NextStepHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-ink-500', className)}>
      <Lightbulb aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span>{children}</span>
    </p>
  );
}
