# Frontend — `@project-sovereign/frontend`

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui (Radix base) · TanStack Query 5 · Axios · Zustand 5 ·
React Hook Form + Zod · Biome.

## Scripts

```bash
bun run dev        # dev server on :3000
bun run build      # production build
bun run start      # serve the production build
bun run typecheck  # next typegen && tsc --noEmit
bun run lint       # biome check .
bun run lint:fix   # biome check --write .
bun run format     # biome format --write .
bun run clean      # remove .next
```

## Configuration

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Any `NEXT_PUBLIC_*` value is inlined into the browser bundle at build time.
Never put a secret in one.

## Structure

```
src/
├── app/            # App Router — layout.tsx, page.tsx, globals.css
├── components/
│   ├── providers.tsx          # TanStack Query client provider
│   ├── create-task-form.tsx   # RHF + zodResolver form
│   ├── task-list-panel.tsx    # useQuery + Axios + Zustand filters
│   └── ui/                    # shadcn components (do not hand-edit)
├── lib/
│   ├── api.ts       # Axios instance + error envelope unwrapping
│   ├── env.ts       # NEXT_PUBLIC_* configuration
│   ├── schemas.ts   # mirrored API contract (keep in sync with backend)
│   └── utils.ts     # shadcn `cn` helper
└── store/
    └── ui-store.ts  # Zustand — ephemeral UI state only
```

## Notes

- **Data fetching** is TanStack Query. Server data must not be copied into the
  Zustand store.
- **Forms** use `useForm` with `zodResolver`. Because the schema has a
  `.default()`, the form is typed with `z.input` (fields) and `z.output`
  (submitted value) — see `create-task-form.tsx`.
- **shadcn** is configured in `components.json` with style `radix-nova`. Add
  components with `bunx shadcn@latest add <name>` from this directory. Note the
  registry has no `form` component in this style.
- **Biome** ignores `src/components/ui/**` so regenerated shadcn files do not
  create formatting churn.
