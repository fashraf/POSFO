import { useRef, useState, type ReactNode } from 'react';
import { Download, Filter, Upload, X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { useToast } from '@/contexts/ToastContext';

/** Escapes a cell so commas and quotes survive the round trip. */
function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','));
  return [header, ...body].join('\n');
}

export interface DataToolsProps {
  /** Rows as currently filtered — never the whole table. */
  rows: Record<string, unknown>[];
  columns: string[];
  filename: string;
  /** Extra filter controls, shown in the advanced panel. */
  advanced?: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  onImport?: (rows: string[][]) => void;
  className?: string;
}

/**
 * Export, import, and advanced filtering.
 *
 * Export deliberately takes what is on screen rather than the full dataset:
 * someone who has filtered to one month and pressed Export means that month,
 * and quietly handing them everything is worse than useless.
 */
export function DataTools({
  rows,
  columns,
  filename,
  advanced,
  activeFilterCount = 0,
  onClearFilters,
  onImport,
  className,
}: DataToolsProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<string[][]>([]);

  function exportCsv() {
    const csv = toCsv(rows, columns);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    toast.success(t('dataTools.exported', { count: rows.length }));
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => line.split(','));
      setParsed(lines);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className={cn('flex items-center gap-1.5', className)}>
        {advanced && (
          <Button
            variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            leadingIcon={<Filter />}
            onClick={() => setShowAdvanced(true)}
          >
            {t('dataTools.advanced')}
            {activeFilterCount > 0 && (
              <Badge tone="brand" className="ms-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}

        {onImport && (
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Upload />}
            onClick={() => setImporting(true)}
          >
            {t('dataTools.import')}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Download />}
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          {t('dataTools.export')}
        </Button>
      </div>

      <Modal
        open={showAdvanced}
        onClose={() => setShowAdvanced(false)}
        size="sm"
        title={t('dataTools.advanced')}
        description={t('dataTools.advancedHint')}
        footer={
          <>
            {onClearFilters && (
              <Button
                variant="ghost"
                leadingIcon={<X />}
                onClick={() => {
                  onClearFilters();
                  setShowAdvanced(false);
                }}
              >
                {t('dataTools.clearFilters')}
              </Button>
            )}
            <Button onClick={() => setShowAdvanced(false)}>{t('dataTools.apply')}</Button>
          </>
        }
      >
        <div className="space-y-3">{advanced}</div>
      </Modal>

      <Modal
        open={importing}
        onClose={() => {
          setImporting(false);
          setParsed([]);
        }}
        size="sm"
        title={t('dataTools.importTitle')}
        description={t('dataTools.importHelp')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setImporting(false);
                setParsed([]);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              disabled={parsed.length < 2}
              onClick={() => {
                onImport?.(parsed.slice(1));
                setImporting(false);
                setParsed([]);
              }}
            >
              {t('dataTools.importConfirm', { count: Math.max(0, parsed.length - 1) })}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
            }}
          />

          <Button variant="outline" leadingIcon={<Upload />} onClick={() => fileRef.current?.click()}>
            {t('dataTools.importFile')}
          </Button>

          {parsed.length > 0 && (
            <>
              <p className="text-xs text-ink-600">
                {t('dataTools.importPreview', { count: parsed.length - 1 })}
              </p>

              <div className="max-h-40 overflow-auto rounded-md border border-ink-200 text-2xs">
                <table className="w-full">
                  <tbody>
                    {parsed.slice(0, 5).map((row, index) => (
                      <tr key={index} className={cn(index === 0 && 'bg-ink-50 font-medium')}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border-b border-ink-100 px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
