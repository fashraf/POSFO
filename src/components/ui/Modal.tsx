import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import { useTranslation } from '@/i18n';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Modal widths.
 *
 * Every size has a viewport floor as well as a cap, so a dialog never shrinks
 * to a narrow strip on a wide screen. A confirmation squeezed into 384px on a
 * 27-inch monitor reads as an error message rather than a decision to make.
 */
const SIZES: Record<ModalSize, string> = {
  sm: 'sm:w-[55vw] sm:max-w-md',
  md: 'sm:w-[60vw] sm:max-w-2xl',
  lg: 'sm:w-[70vw] sm:max-w-4xl',
  xl: 'sm:w-[80vw] sm:max-w-6xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /** Footer content, usually a cancel plus a primary action. */
  footer?: ReactNode;
  /** Set false for a flow the user must resolve with a button. */
  dismissible?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissible = true,
  children,
  className,
}: ModalProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    /* Move focus into the dialog so the keyboard path starts inside it. */
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 animate-fade-in bg-ink-900/35 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          /* Full width on a phone, where a percentage floor would be absurd; the
             floor only applies once there is room for it. */
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-overlay outline-none animate-scale-in sm:min-h-[55vh] sm:rounded-xl',
          SIZES[size],
          className,
        )}
      >
        {(title || dismissible) && (
          <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
            <div className="min-w-0 space-y-1">
              {title && <h2 className="text-md font-semibold text-ink-900">{title}</h2>}
              {description && <p className="text-sm text-ink-500">{description}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="-me-1 -mt-1 shrink-0 rounded p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
          </header>
        )}

        {/* A caller that fixes the panel height gets a body that fills it, so
            its own columns can scroll rather than the whole dialog. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-base text-ink-700">
          {children}
        </div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
