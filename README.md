# POS Platform — Frontend Foundation

**Version 1.0.0**

A bilingual (Arabic / English) React foundation for a multi-industry point of sale platform. This repository contains the shell, the design system, and the service abstractions — no application pages and no business logic yet.

---

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |

The app needs the Nazad POS API running — there is no offline or demo mode. In development the Vite dev server proxies `/api` to `API_PROXY_TARGET` (see `.env.development`, default `http://localhost:5001`).

---

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router · Lucide React · Recharts

---

## Project structure

```
src/
├── components/
│   ├── ui/           Design system — buttons, forms, tables, overlays, states
│   └── layout/       App shell — sidebar, header, mobile nav, brand
├── config/           navigation.ts — the single source for the menu
├── contexts/         Toast provider
├── hooks/            useDisclosure, useMediaQuery, useDebouncedValue, …
├── i18n/             Provider, config, and the ar/en dictionaries
├── lib/              cn (class merge), format (money/date/number), version
├── pages/            Route components
├── routes/           Router definition, path constants, error boundary
├── services/         Typed HTTP client and the resource-service factory
├── styles/           Tailwind entry and base styles
└── types/            Shared types — ID, Paginated, Result, Option, …
```

---

## Adding a page

Three edits, in this order:

**1. Create the page** in `src/pages/`:

```tsx
// src/pages/ProductsPage.tsx
import { PageHeader } from '@/components/ui';

export default function ProductsPage() {
  return <PageHeader title="Products" />;
}
```

**2. Export and route it** — add it to `src/pages/index.ts`, add a path to `src/routes/paths.ts`, then register the route in `src/routes/index.tsx`:

```tsx
{ path: ROUTES.products.slice(1), element: <ProductsPage /> },
```

**3. Add it to the menu** in `src/config/navigation.ts`:

```ts
{ id: 'products', to: ROUTES.products, labelKey: 'nav.products', icon: Package }
```

The sidebar and the mobile bar both read from that file, so there is no second list to keep in sync.

---

## Bilingual support

Arabic is the default. The language switcher in the header sets `lang` and `dir` on `<html>`, persists the choice, and the layout mirrors automatically.

Add copy to **both** `src/i18n/locales/en.ts` and `src/i18n/locales/ar.ts`. The Arabic file is typed against the English one, so a missing translation is a build error rather than a silent fallback.

```tsx
const { t } = useTranslation();
t('common.save');
t('table.showing', { from: 1, to: 25, total: 340 });
```

`t()` autocompletes every valid key and rejects typos at compile time.

### Writing RTL-safe styles

Use Tailwind's logical properties and the layout mirrors itself:

| Use | Not |
|---|---|
| `ps-4` / `pe-4` | `pl-4` / `pr-4` |
| `ms-2` / `me-2` | `ml-2` / `mr-2` |
| `start-0` / `end-0` | `left-0` / `right-0` |
| `text-start` / `text-end` | `text-left` / `text-right` |
| `border-s` / `border-e` | `border-l` / `border-r` |

Add `flip-rtl` to any icon that encodes direction (chevrons, arrows).

---

## Money

Money is handled in **minor units (halalas)** as integers. No floating point value ever represents an amount.

```tsx
import { CurrencyDisplay } from '@/components/ui';
import { toMinorUnits, fromMinorUnits } from '@/lib/format';

<CurrencyDisplay amount={4000} />        // SAR 40.00
toMinorUnits('40.00')                    // 4000
fromMinorUnits(4000)                     // "40.00"
```

`CurrencyDisplay` renders LTR with tabular figures even on an Arabic page, so columns of numbers stay aligned and comparable.

---

## Connecting the API

Nothing above `src/services/http.ts` knows about `fetch`, URLs, or status codes. Set the base URL and the rest of the app is unchanged:

```bash
# .env.local
VITE_API_BASE_URL=https://localhost:7001
```

Then define a service:

```ts
// src/services/productService.ts
import { createResourceService } from '@/services';
import type { Product, ProductInput } from '@/types';

export const productService = createResourceService<Product, ProductInput>('/products');
```

That gives you `list`, `get`, `create`, `update`, and `remove`, fully typed against `Paginated<T>`. Use `safeCall` when you want a `Result` instead of a thrown error:

```ts
const result = await safeCall(() => productService.list({ page: 1 }));
if (result.ok) setItems(result.data.items);
else toast.error(result.error.message);
```

Components should call services. They should never call `fetch` directly.

---

## Design tokens

Defined in `tailwind.config.js`, used through Tailwind classes only — no raw hex values in components.

| Token | Use |
|---|---|
| `ink-50` … `ink-900` | Backgrounds, borders, text. Most of the interface. |
| `brand-*` | Primary actions and active navigation state, nothing else. |
| `success` / `warning` / `danger` / `info` | Status only. |

Surfaces are white with a hairline `ink-200` border and `shadow-xs`. The `.surface` class in `src/styles/index.css` bundles that treatment.

---

## Component library

Browse every component live at `/components` in the running app.

**Actions** Button · Dropdown
**Forms** Input · Textarea · Select · SearchInput · PriceInput · Checkbox · Switch · FormField
**Data** Table · Pagination · Tabs · Badge · StatusBadge · Avatar · KpiCard · CurrencyDisplay · ChartCard
**Overlays** Modal · Drawer · ConfirmDialog · Toast
**States** EmptyState · LoadingState · ErrorState · Skeleton
**Layout** Card · PageHeader · AppLayout

Extend an existing component with a new prop rather than creating a near-duplicate.

---

## Versioning

`APP_VERSION` in `src/lib/version.ts` is the single source, displayed in the sidebar. Keep it in step with `package.json`.

- **Major** (1.0.0 → 2.0.0) — a breaking change to the design system, the routing shape, or the service contracts.
- **Minor / patch** — everything else.
