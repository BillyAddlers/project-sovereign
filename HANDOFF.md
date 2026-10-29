# HANDOFF: Project Sovereign

> Dokumen konteks untuk memulai sesi baru. Terakhir diperbarui: 2026-10-29.
> Sumber kebenaran lain: `README.md` (cara menjalankan), `docs/AGENTS.md` (konvensi & gotchas),
> `TODO.md` (status fase + catatan keputusan lengkap), `docs/assessment-brief.md` (spec asli).

## Apa ini

Project Sovereign adalah project latihan (spec: assessment brief NodeWave) berupa aplikasi
manajemen deliverable dengan tiga fokus teknis: **izin berbasis state**, **dependensi antar task**,
dan **kontrol konkurensi**. Tidak ada deadline dan tidak ada submission; brief dipakai sebagai
spesifikasi belajar. Keputusan sadar: repo tetap **monorepo** walau brief meminta dua repo terpisah.

Monorepo Bun: `apps/frontend` (Next.js 16 App Router) + `apps/backend` (Hono + Prisma 7 +
PostgreSQL). Kedua app extends `tsconfig.base.json`.

## Status fase (ringkas dari `TODO.md`)

| Fase | Isi | Status |
|------|-----|--------|
| 0 / 0b | Fondasi monorepo, keputusan & fix kecil | ✅ |
| 1 | Domain model + Auth JWT | ✅ |
| 2 | Authorization core (RBAC + ABAC + state-based) | ✅ |
| 3 | Concurrency (optimistic locking) + audit trail + soft delete | ✅ |
| 4 | Frontend per-role (dashboard + task board) | ✅ |
| 5 | Deployment practice | ⬜ (opsional) |
| 6 | Backlog belajar (standup summary, FE test, CI) | ⬜ |

## Stack & versi (di-pin, jangan upgrade tanpa instruksi)

Bun 1.4.2 (runtime, package manager, test runner) · TypeScript strict · Husky + Commitlint
(conventional) · Biome (scoped frontend).

Frontend: Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui pada basis Radix
(style `radix-nova`, **tidak ada** komponen `ui/form`; pola form RHF manual) · TanStack Query 5 ·
Axios · Zustand 5 · React Hook Form + Zod · font Geist Sans + Geist Mono.

Backend: Hono 4 · Prisma 7.10 dengan driver adapter `@prisma/adapter-pg` (tanpa `url` di schema,
connect via `src/lib/prisma.ts`) · Zod 4 · `jsonwebtoken` · `@nodewave/prisma-ezfilter`.

## Menjalankan

```bash
# 1. Database (container podman; port 5433 karena host postgresql.service menempati 5432)
podman start project-sovereign-postgres
# kalau container terhapus: POSTGRES_PORT=5433 bun run db:up

# 2. Dua terminal terpisah (jangan digabung dengan &&)
bun run dev:backend      # :3001
bun run dev:frontend     # :3000

# 3. Seed (idempoten, aman diulang)
bun run db:seed
```

Definition of done (dari root): `bun run typecheck && bun run lint && bun run test && bun run build`.
Backend punya 80+ test (`bun test`); **frontend tidak punya test runner**, jangan pernah
mengklaim frontend tests lulus.

## Akun demo

Dibuat oleh `bun run db:seed`. Password semua akun: `password123`.

| Email | Role | Department |
|-------|------|------------|
| `pm@demo.local` | pm | - |
| `qa@demo.local` | engineer | qa |
| `frontend@demo.local` | engineer | frontend |
| `backend@demo.local` | engineer | backend |
| `client@demo.local` | client | - |

## Arsitektur backend

Mount di `src/app.ts`: `/api/health`, `/api/auth`, `/api/tasks`, `/api/projects`,
`/api/attachments`, `/api/users`. Semua handler error melewati `app.onError` yang menghasilkan
envelope `{ error: { code, message, details? } }`.

- `src/middleware/auth.ts`: `requireAuth`. Baca cookie httpOnly `ps_token`, verifikasi JWT,
  cek user masih hidup di DB (token soft-deleted user langsung mati), lalu `c.set("user")`.
- `src/lib/permissions.ts`: **satu-satunya** sumber keputusan izin, pure function, punya unit test.
  - PM: read/write penuh project & task, CRUD project, kelola member, tapi **dilarang set status
    `done`**; hanya assignee (executor) yang boleh menyelesaikan task.
  - Engineer: **hanya melihat task yang `assigneeId`-nya dirinya** (scope server-side); boleh
    `todo→in_progress` (syarat: semua dependensi sudah `done`) lalu `in_progress→done`;
    upload attachment pada tasknya.
  - Client: hanya project sendiri + task `clientVisible`; response di-mask (tanpa identitas
    assignee, attachment, atau judul dependensi internal); hanya baca agregat.
- `src/lib/scope.ts` + `access.ts`: Prisma `where` per role dan loader akses project.
- `src/lib/serialize.ts`: `serializeTask` (menghitung `blocked` turunan, menyertakan
  `dependencies` dan `attachments`), masking Client, `serializeProject`.
- **Optimistic locking**: `PATCH /api/tasks/:id` wajib kirim `expectedVersion`; server menjalankan
  `updateMany` dengan `where { id, version: expectedVersion }` + `version: { increment: 1 }`.
  Yang kalah mendapat **409 `VERSION_CONFLICT`** (details: expectedVersion, currentVersion).
  Tidak ada read-then-write karena bocor TOCTOU.
- **Audit trail** (`src/lib/audit.ts`): append-only, satu baris per kolom yang benar-benar berubah,
  ditulis dalam transaksi yang sama dengan mutasinya. Tidak ada endpoint update/delete untuk audit.
- **Soft delete**: `DELETE /api/tasks/:id` menulis `deletedAt` + bump version; dependency dan
  attachment tetap tersimpan agar jejak audit tetap valid. Prasyarat yang soft-deleted tidak lagi
  memblokir dependent.
- **Attachment**: `POST /api/tasks/:id/attachments` (multipart, field `file`, limit 10 MB);
  file tersimpan di `apps/backend/uploads/` (gitignored), `Attachment.url` = nama file server-side,
  API hanya mengekspos `/api/attachments/:id/download`.
- **Dependensi**: `createTaskSchema` menerima `dependencyIds` (maks 20, di-dedupe, wajib satu
  project; tidak perlu cek cycle karena task baru belum punya dependent). Endpoint
  `POST/DELETE /api/tasks/:id/dependencies` khusus PM dengan pencegahan cycle. `blocked` adalah
  state turunan saat baca, bukan nilai enum.
- **Kontrak API**: `apps/backend/src/lib/schemas.ts` adalah source of truth; mirror ada di
  `apps/frontend/src/lib/schemas.ts`. Keduanya wajib diubah dalam satu commit.

## Arsitektur frontend

- Route group `src/app/(app)/` dibungkus `AuthGuard` + `AppShell`; `/login` di luar grup.
- `AppShell` (sidebar): desktop permanen `w-56`, bisa collapse ke `w-16` (state di Zustand
  `ui-store.sidebarCollapsed`); mobile memakai drawer dengan hamburger. Animasi drawer harus
  memakai `transition-[width,translate]` (lihat jebakan Tailwind di bawah).
- Data lewat TanStack Query (`src/hooks/use-tasks.ts`) + Axios instance dengan
  `withCredentials: true`. Setiap response di-parse Zod di `src/lib/resources.ts` sehingga
  perubahan kontrak gagal keras di client.
- `src/store/ui-store.ts` hanya untuk state UI ephemeral (filter), bukan data server.
- Board (`/board`): kolom todo/in_progress/done; engineer default "My tasks"; kartu menampilkan
  status, priority, badge Blocked, dependensi, assignee, attachment; PM bisa create/edit/
  define dependensi/delete; engineer bisa Start/Complete/Attach pada tasknya; client read-only.
- Dashboard (`/`): pernyataan progres + kartu statistik (total, % complete, per status, blocked)
  dari `GET /api/projects/:id/stats`.
- Form memakai React Hook Form + Zod resolver dengan pola manual (registry radix-nova tidak punya
  `ui/form`, `shadcn add form` diam-diam tidak melakukan apa-apa).

## Keputusan yang sudah dikunci (versi singkat)

- Monorepo dipertahankan secara sadar (deviasi dari brief).
- Sesi auth: cookie httpOnly `ps_token` (SameSite=Lax, Secure hanya di production), JWT 7 hari.
  Logout hanya menghapus cookie; token stateless tetap valid sampai kedaluwarsa.
- Register API terbuka dengan field `role`/`department` (department wajib untuk engineer).
- PM tidak boleh menyelesaikan task dari state apa pun (lebih ketat dari brief).
- Engineer actions assigned-only, dan visibility engineer juga assigned-only.
- Client masking dilakukan di API, bukan di CSS.
- `department` hanya untuk display/picker; aturan "task UI/UX harus Done" dimodelkan sebagai
  dependensi antar-task, bukan aturan per-department.
- Tidak ada migration baru di Fase 2/3: kolom `version`, `deletedAt` dan model `AuditLog` sudah
  ada sejak Fase 1.

## Jebakan yang sudah diketahui (jangan terkena dua kali)

1. **Prisma**: jangan pernah `bunx prisma` (mengambil CLI 8.x RC). Gunakan workspace scripts.
   `bun run db:generate` wajib setelah mengubah schema sebelum typecheck. `db:migrate`
   (`migrate dev`) yang membuat file migration baru; `db:reset` hanya **mereplay** file yang ada.
2. **Zod 4**: `.partial()` **mempertahankan** `.default()`, jadi PATCH `{status}` bisa diam-diam
   membawa `priority`/`clientVisible`. `updateTaskSchema` sengaja didefinisikan eksplisit.
3. **Tailwind 4**: `translate-x-*` memakai properti CSS `translate`, bukan `transform`.
   `transition-[width,transform]` tidak menganimasi drawer; gunakan `transition-[width,translate]`.
4. **Biome**: fungsi dengan awalan `use` dianggap hook React, jadi helper tidak boleh dinamai
   `useAccount`; gunakan `applyAccount`.
5. **Dev server**: error `module factory is not available` atau UI yang tampak basi = cache stale.
   Hentikan server, hapus `apps/frontend/.next`, jalankan ulang, hard reload (`Ctrl+Shift+R`).
6. **Working tree bisa ditimpa editor/agent lain**: pernah ada perubahan uncommitted yang
   membalik beberapa perbaikan UI. Selalu `git status` dan `git diff` sebelum menganggap kode
   rusak.
7. **Gambar/screenshot tidak pernah sampai ke agent.** Jelaskan masalah dengan teks, URL, atau
   potongan HTML.
8. **Commit**: Conventional Commits dengan `type-enum` ketat (feat, fix, docs, ...); `(fea)` ditolak
   commitlint. Push hanya setelah diminta. `.serena/project.yml` muncul sebagai modified terus
   (tooling) dan sengaja tidak di-commit.
9. `.claude/` dan `.windsurf/` di `apps/backend` adalah artefak Prisma untuk AI tooling dan
   sudah gitignored.

## Riwayat terakhir

Sidebar sebagai navigasi utama (squash jadi commit `feat: Change navbar to sidebar` setelah beberapa
iterasi: sidebar, top navbar, hamburger, lalu kembali ke sidebar). Setelah itu temen menambahkan,
di antaranya: engineer visibility di-scope ke task assigned di server (lalu toggle "All project
tasks" di FE dibuang), dashboard dipimpin pernyataan progres, sistem tipe disatukan ke keluarga
Geist, AGENTS.md di-resync dengan kode, dan compose.dev.yaml diberi healthcheck untuk cold start.

## Benang terbuka

1. **Halaman Register belum ada di UI.** Endpoint `/api/auth/register` dan wrapper
   `authApi.register` sudah ada; brief mewajibkan register di API **dan** UI.
2. **Fase 5 (opsional)**: deploy backend ke URL publik + PostgreSQL terprovisioni + volume untuk
   `apps/backend/uploads/`, deploy frontend dengan `NEXT_PUBLIC_BE_URL`, verifikasi login semua
   akun seeded, architecture overview, screenshot + recording <3 menit.
3. **Fase 6 (backlog)**: endpoint standup auto-summary dari audit trail per departemen; minimal
   satu test komponen frontend (butuh test runner dulu); CI GitHub Actions (format + lint + build).
4. Percobaan UI sidebar selesai, tapi gaya visual belum tentu final versi temen yang sedang aktif
   mengedit. Koordinasikan sebelum mengubah `app-shell.tsx`.

## Catatan lingkungan

- `.env` backend menunjuk `postgresql://admin:password@localhost:5433/project_sovereign`;
  frontend memakai `NEXT_PUBLIC_BE_URL`.
- Skill global `antislop` terpasang (mode `during` tersimpan di
  `~/.config/antislop/settings.json`) dan akan dimuat otomatis oleh sesi baru.
- Repo remote: `git@github.com:BillyAddlers/project-sovereign.git`, branch `master`.
  Temen (`Fuiyooo`) aktif commit; hotspot konflik merge biasanya `TODO.md` dan `docs/AGENTS.md`.
