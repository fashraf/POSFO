import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

export interface ToastOptions {
  tone?: ToastTone;
  description?: string;
  /** Milliseconds before auto-dismiss. Pass 0 to require a manual dismiss. */
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (title: string, options?: ToastOptions) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_TONES: Record<ToastTone, string> = {
  success: 'text-success-500',
  error: 'text-danger-500',
  warning: 'text-warning-500',
  info: 'text-info-500',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (title: string, options: ToastOptions = {}) => {
      const { tone = 'info', description, duration = 4000 } = options;
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setToasts((current) => [...current, { id, tone, title, description, duration }]);

      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      notify,
      dismiss,
      success: (title, description) => notify(title, { tone: 'success', description }),
      error: (title, description) => notify(title, { tone: 'error', description, duration: 6000 }),
      warning: (title, description) => notify(title, { tone: 'warning', description }),
      info: (title, description) => notify(title, { tone: 'info', description }),
    }),
    [toasts, notify, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="region"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-4 sm:end-4 sm:items-end"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-ink-200 bg-surface p-3.5 shadow-md animate-toast-in"
          >
            <Icon aria-hidden className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', ICON_TONES[toast.tone])} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-base font-medium text-ink-900">{toast.title}</p>
              {toast.description && <p className="text-sm text-ink-500">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="-me-1 -mt-1 shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">Dismiss</span>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}
