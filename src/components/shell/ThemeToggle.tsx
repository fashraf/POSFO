import { Monitor, Moon, Sun } from 'lucide-react';
import { Dropdown } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import { useTranslation } from '@/i18n';

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, theme, setPreference } = useTheme();

  /* The button shows what is on screen; the menu shows what was chosen. Those
     differ whenever the preference is "system". */
  const Current = theme === 'dark' ? Moon : Sun;

  return (
    <Dropdown
      align="end"
      trigger={
        <button
          type="button"
          aria-label={t('theme.toggle')}
          className="rounded p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <Current aria-hidden className="h-4 w-4" />
        </button>
      }
      items={(['light', 'dark', 'system'] as ThemePreference[]).map((option) => {
        const Icon = ICONS[option];
        return {
          key: option,
          label: (
            <span className={cn(option === preference && 'font-medium text-brand-700')}>
              {t(`theme.${option}`)}
            </span>
          ),
          icon: <Icon />,
          onSelect: () => setPreference(option),
        };
      })}
    />
  );
}
