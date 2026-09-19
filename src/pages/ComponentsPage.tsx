import { useState, type ReactNode } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmDialog,
  CurrencyDisplay,
  Drawer,
  Dropdown,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  PriceInput,
  SearchInput,
  Select,
  SkeletonTable,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Textarea,
} from '@/components/ui';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-md font-semibold text-ink-900">{title}</h2>
      <Card>
        <CardBody className="space-y-5">{children}</CardBody>
      </Card>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

export default function ComponentsPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const modal = useDisclosure();
  const drawer = useDisclosure();
  const confirm = useDisclosure();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [switched, setSwitched] = useState(true);
  const [demoCategory, setDemoCategory] = useState('');

  return (
    <div className="space-y-8">
      <PageHeader title={t('components.title')} description={t('components.description')} />

      <Section title={t('components.buttons')}>
        <Row label={t('components.variants')}>
          <Button>{t('common.save')}</Button>
          <Button variant="secondary">{t('common.edit')}</Button>
          <Button variant="outline">{t('common.cancel')}</Button>
          <Button variant="ghost">{t('common.view')}</Button>
          <Button variant="danger" leadingIcon={<Trash2 />}>
            {t('common.delete')}
          </Button>
          <Button variant="link">{t('common.more')}</Button>
        </Row>

        <Row label={t('components.sizes')}>
          <Button size="sm" leadingIcon={<Plus />}>
            {t('common.add')}
          </Button>
          <Button size="md" leadingIcon={<Plus />}>
            {t('common.add')}
          </Button>
          <Button size="lg" leadingIcon={<Plus />}>
            {t('common.add')}
          </Button>
          <Button size="icon" aria-label={t('common.add')}>
            <Plus className="h-4 w-4" />
          </Button>
        </Row>

        <Row label={t('components.states')}>
          <Button loading>{t('common.save')}</Button>
          <Button disabled>{t('common.save')}</Button>
        </Row>
      </Section>

      <Section title={t('components.forms')}>
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label={t('common.search')} hint="Helper text sits under the control.">
            <Input placeholder={t('common.searchPlaceholder')} />
          </FormField>

          <FormField label="Selling price" required>
            <PriceInput placeholder="0.00" defaultValue="40.00" />
          </FormField>

          <FormField label="Category" required>
            <Select
              placeholder="Choose one"
              value={demoCategory}
              onChange={setDemoCategory}
              isClearable
              options={[
                { value: 'products', label: 'Products' },
                { value: 'services', label: 'Services' },
              ]}
            />
          </FormField>

          <FormField label="Barcode" error="This barcode is already in use.">
            <Input defaultValue="6281000000000" dir="ltr" />
          </FormField>

          <FormField label="Notes" showOptional className="md:col-span-2">
            <Textarea placeholder="Anything worth remembering about this record." />
          </FormField>
        </div>

        <div className="flex flex-col gap-4 border-t border-ink-200 pt-5 sm:flex-row sm:items-center sm:gap-8">
          <Checkbox label="Show on POS" description="Appears in the sell grid." defaultChecked />
          <Switch
            checked={switched}
            onCheckedChange={setSwitched}
            label="Track inventory"
            description="Deduct stock on every sale."
          />
        </div>

        <div className="max-w-sm">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} />
        </div>
      </Section>

      <Section title={t('components.dataDisplay')}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Today's sales" value={<CurrencyDisplay amount={1845000} />} change={0.125} changeLabel="vs yesterday" />
          <KpiCard label="Transactions" value={<span className="numeric">184</span>} change={0.082} changeLabel="vs yesterday" />
          <KpiCard label="Average sale" value={<CurrencyDisplay amount={10027} />} change={0.043} changeLabel="vs yesterday" />
          <KpiCard label="Refunds" value={<CurrencyDisplay amount={32500} />} change={0.061} changeLabel="vs yesterday" invertTrend />
        </div>

        <Row label={t('components.variants')}>
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success" dot>
            Paid
          </Badge>
          <Badge tone="warning" dot>
            Pending
          </Badge>
          <Badge tone="danger" dot>
            Overdue
          </Badge>
          <Badge tone="info">Draft</Badge>
          <StatusBadge status="active" />
          <Avatar name="Ahmed Ali" size="sm" />
          <Avatar name="Sara Abdullah" />
        </Row>

        <Tabs
          value={tab}
          onChange={setTab}
          aria-label={t('components.dataDisplay')}
          items={[
            { value: 'all', label: t('common.all'), count: 3 },
            { value: 'products', label: 'Products', count: 2 },
            { value: 'services', label: 'Services', count: 1 },
          ]}
        />

        <div className="overflow-hidden rounded-lg border border-ink-200">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell numeric>Price</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow interactive>
                <TableCell className="font-medium text-ink-900">Coca Cola 330ml</TableCell>
                <TableCell>Product</TableCell>
                <TableCell numeric>
                  <CurrencyDisplay amount={300} />
                </TableCell>
                <TableCell>
                  <StatusBadge status="active" />
                </TableCell>
              </TableRow>
              <TableRow interactive>
                <TableCell className="font-medium text-ink-900">Haircut</TableCell>
                <TableCell>Service</TableCell>
                <TableCell numeric>
                  <CurrencyDisplay amount={4000} />
                </TableCell>
                <TableCell>
                  <StatusBadge status="active" />
                </TableCell>
              </TableRow>
              <TableRow interactive>
                <TableCell className="font-medium text-ink-900">Hair Gel</TableCell>
                <TableCell>Product</TableCell>
                <TableCell numeric>
                  <CurrencyDisplay amount={2250} />
                </TableCell>
                <TableCell>
                  <StatusBadge status="inactive" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={10} total={34} onPageChange={setPage} />
        </div>
      </Section>

      <Section title={t('components.overlays')}>
        <Row label={t('components.variants')}>
          <Button variant="outline" onClick={modal.open}>
            {t('components.openModal')}
          </Button>
          <Button variant="outline" onClick={drawer.open}>
            {t('components.openDrawer')}
          </Button>
          <Button variant="outline" onClick={confirm.open}>
            {t('components.openConfirm')}
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.success(t('components.toastMessage'), t('components.toastDescription'))}
          >
            {t('components.showToast')}
          </Button>
          <Dropdown
            trigger={<Button variant="outline">{t('common.actions')}</Button>}
            items={[
              { key: 'view', label: t('common.view') },
              { key: 'edit', label: t('common.edit') },
              { key: 'delete', label: t('common.delete'), destructive: true, separated: true },
            ]}
          />
        </Row>
      </Section>

      <Section title={t('components.pageStates')}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-ink-200">
            <EmptyState
              size="sm"
              icon={<Package />}
              title="No products yet"
              description="Add your first product and it will show up here."
              action={
                <Button size="sm" leadingIcon={<Plus />}>
                  {t('common.add')}
                </Button>
              }
            />
          </div>
          <div className="rounded-lg border border-ink-200">
            <LoadingState className="py-10" />
          </div>
          <div className="rounded-lg border border-ink-200">
            <ErrorState className="py-8" onRetry={() => toast.info(t('common.retry'))} />
          </div>
        </div>

        <div className="rounded-lg border border-ink-200">
          <SkeletonTable rows={3} columns={4} />
        </div>
      </Section>

      <Modal
        open={modal.isOpen}
        onClose={modal.close}
        title={t('components.sampleModalTitle')}
        footer={
          <>
            <Button variant="outline" onClick={modal.close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={modal.close}>{t('common.saveChanges')}</Button>
          </>
        }
      >
        <p>{t('components.sampleModalBody')}</p>
      </Modal>

      <Drawer
        open={drawer.isOpen}
        onClose={drawer.close}
        title={t('components.sampleDrawerTitle')}
        footer={
          <>
            <Button variant="outline" onClick={drawer.close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={drawer.close}>{t('common.saveChanges')}</Button>
          </>
        }
      >
        <p>{t('components.sampleDrawerBody')}</p>
      </Drawer>

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={() => {
          confirm.close();
          toast.success(t('components.toastMessage'));
        }}
      />
    </div>
  );
}
