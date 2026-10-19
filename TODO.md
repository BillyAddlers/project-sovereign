# TODO — Project Sovereign

> Sumber kebenaran: **Fullstack Engineer Assessment Brief** (NodeWave) —
> `docs/assessment-brief.md` (transkripsi rapi; dokumen asli: `docs/assessment-brief.docx`).
> Konteks: **project latihan & eksplorasi** — tidak ada deadline, tidak ada submission.
>   Brief dipakai sebagai spec belajar; item submission bersifat opsional.
> Keputusan struktur: **monorepo dipertahankan secara sadar** (deviasi dari brief
>   "two separate repos" — tidak relevan untuk latihan, tapi tetap dicatat).
> Terakhir diperbarui: 2026-10-19

## Status ringkas

| Fase | Nama                            | Status        |
|------|---------------------------------|---------------|
| 0    | Fondasi monorepo                | ✅ Selesai    |
| 0b   | Langkah 0: keputusan & fix kecil | ✅ Selesai    |
| 1    | Domain model + Auth JWT         | ✅ Selesai    |
| 2    | Authorization core              | 🟡 BE selesai |
| 3    | Concurrency + audit trail       | ⬜            |
| 4    | Frontend per-role (task board)  | ✅ Selesai    |
| 5    | Deployment practice (opsional)  | ⬜            |
| 6    | Backlog belajar                 | ⬜            |

Urutan eksekusi: **0b → 1 ✅ → 2 → 3 → 4 → 5/6**. Alasan: guard butuh
identitas (1→2), service izin adalah sumber kebenaran kunci tombol UI (2→4),
audit/locking backend-internal mendahului UI yang mendemokannya (3→4).
Langkah 0 murah sekarang, jadi rework di tengah fase.

## Akun demo untuk testing
Dibuat oleh `bun run db:seed` (idempoten — aman dijalankan ulang). Password **semua akun**:
**`password123`**. Prasyarat: database jalan (mis. `podman-compose -f compose.dev.yaml up -d db`
atau `bun run db:up`), lalu `bun run db:seed`.

| Email                 | Role     | Department | Catatan                        |
|-----------------------|----------|------------|--------------------------------|
| `pm@demo.local`       | pm       | —          | akses penuh (project manager)  |
| `qa@demo.local`       | engineer | qa         | engineer QA                    |
| `frontend@demo.local` | engineer | frontend   | engineer frontend              |
| `backend@demo.local`  | engineer | backend    | engineer backend               |
| `client@demo.local`   | client   | —          | owner project contoh           |

Catatan: department `qa` ditambahkan lewat migration `20261009140949_add_qa_department`
(menggantikan akun `uiux@demo.local` yang lama). Login lewat UI di `/login`; API lewat
`POST /api/auth/login`.

## Langkah 0 — Keputusan & fix kecil (sebelum fase berikutnya)
- [x] Samakan nama env var → **rename kode ke `NEXT_PUBLIC_BE_URL`** (mengikuti brief).
      Disamakan di 8 titik: env.ts, .env.example, README frontend, Dockerfile (×2),
      compose.dev.yaml, compose.yaml, AGENTS.md §12. Butuh rebuild image (di-inline saat build)
- [x] Keputusan Comment entity → **keluarkan komentar dari lingkup masking Fase 2**
      (fitur komentar belum ada; masking cukup untuk nama/avatar/departemen). Bila fitur
      komentar ditambahkan nanti, masking WAJIB diperluas ke sana
- [x] Blocked = state turunan, dihitung saat baca dari dependensi — JANGAN menambah
      nilai enum `blocked` ke `TaskStatus` (brief: "otomatis Blocked"; enum hanya
      todo/in_progress/done)
- [x] Fix typo `AuthClaims.deparment` → `department` (apps/backend/src/lib/auth.ts:18)
      — selesai; belum ada pemanggil sign/verify jadi tidak ada token lama yang rusak
- [x] Rekonsiliasi doc port DB — kode & config di repo seragam **5432**; catatan lama
      "5433" di TODO keliru (host `postgresql.service` inactive). Catatan keputusan
      diperbaiki, escape hatch `POSTGRES_PORT` didokumentasikan sebagai cadangan
- [x] Verifikasi checkbox "Baca node_modules/next/dist/docs/" (Fase 1) — `node_modules`
      kini terpasang dan `apps/frontend/node_modules/next/dist/docs/` memang ada;
      klaim tidak basi

## Fase 0 — Fondasi monorepo ✅
- [x] Bun workspace + tsconfig.base strict shared (package.json, tsconfig.base.json)
- [x] Backend: Hono + Prisma 7 driver adapter, CRUD /api/tasks (list paginated/filter/sort, create, get, patch, delete)
- [x] Frontend: Next.js 16 — form create task + panel list (RHF+Zod, TanStack Query+Axios, Zustand filter)
- [x] Container stacks podman-compose (dev hot-reload + prod) + migration auto-apply di boot
- [x] Tooling: Biome, Husky+Commitlint, backend tests (health + error envelope)
- [x] Dokumentasi: README + docs/AGENTS.md

## Fase 1 — Domain model + Auth JWT
### Backend
- [x] Skema Prisma: `User` (role: PM/ENGINEER/CLIENT, department: UIUX/FRONTEND/BACKEND/QA),
      `Project`, `TaskDependency`, `AuditLog`, `Attachment`
      (apps/backend/prisma/schema.prisma)
- [x] Extend `Task`: projectId, assigneeId, clientVisible, deletedAt, version
- [x] `bun run db:generate && bun run db:migrate` setelah skema berubah
      (migration 20261004174035)
- [x] Kontrak API baru di backend/src/lib/schemas.ts + mirror frontend
      (packages/shared ditunda — duplikasi dipertahankan, lihat Catatan keputusan)
- [x] Auth JWT: register, login, logout (jsonwebtoken) + hash password
      → lib/auth.ts: hash Bun.password + sign/verify JWT + cookie helper
        (`setAuthCookie`/`clearAuthCookie`) + `toPublicUser`; routes
        `/api/auth/register|login|logout|me` di routes/auth.ts
- [x] Middleware auth + guard di semua endpoint tasks (apps/backend/src/)
      → `requireAuth` (middleware/auth.ts) dipasang `use("*")` di routes tasks &
        projects; endpoint balas 401 envelope; `/api/auth/me` memulihkan sesi
- [x] Seed: akun PM, Engineer (QA/Frontend/Backend), Client Guest + 1 project
      contoh dengan rantai dependensi (apps/backend/prisma/seed.ts) — terverifikasi di DB
### Frontend
- [x] Halaman login (RHF+Zod), penyimpanan sesi, logout
      → app/login/page.tsx + hooks/use-session.ts + lib/auth-api.ts;
        sesi = cookie httpOnly, header sign-out di app-header.tsx
- [x] Auth guard: protected routes di UI (redirect ke /login)
      → components/auth-guard.tsx membungkus app/page.tsx; 401 → replace /login
- [x] Baca node_modules/next/dist/docs/ SEBELUM menulis kode frontend (Next 16 breaking changes)

## Fase 2 — Authorization core (RBAC + ABAC + state-based permissions) 🟡
> Inti pembelajaran #1 — "permissions that change based on task status".
> Backend selesai + teruji (51 test, 0 fail). UI lock tombol sengaja ditunda ke
> Fase 4 karena action UI di FE belum ada.
- [x] Service izin terpusat — `src/lib/permissions.ts` (pure functions, unit-tested)
- [x] PM: read/write penuh, DILARANG transisi ke `done` dari state mana pun
      (keputusan eksplisit: hanya executor/assignee yang boleh menyelesaikan task),
      boleh define dependensi
- [x] Engineer: hanya task project assigned; set in_progress hanya jika semua dependensi
      Done; tidak boleh ubah title/description; hanya upload attachment + ubah status
- [x] Client: hanya aggregate metrics project sendiri (mis. "% complete") +
      task clientVisible=true — `GET /api/projects/:id/stats`
- [x] Data masking level API: `assignee`/`assigneeId`/attachments/title dependency
      non-clientVisible di-strip dari response Client (bukan disembunyikan via CSS)
- [x] Endpoint upload/download attachment (multipart, limit 10 MB, storage `uploads/`
      + metadata DB) — PM atau engineer yang di-assign
- [x] Guard di setiap endpoint mutasi → 403 envelope `FORBIDDEN`; read scoping per role
      (`taskScope`/`projectScope`)
- [x] Dependency endpoints (`POST/DELETE /api/tasks/:id/dependencies`) + cegah self/cycle
- [x] `blocked` turunan di setiap response task (bukan enum), + daftar dependency
- [ ] UI: tombol aksi terkunci sesuai izin → **dipindah ke Fase 4** (action UI belum ada)

## Fase 3 — Concurrency + audit trail + soft delete
> Inti pembelajaran #2 — "prevention of data concurrency conflicts".
- [ ] Optimistic locking: kolom `version`, PATCH menerima expectedVersion,
      versi basi → 409 Conflict
- [ ] AuditLog immutable: setiap perubahan field task mencatat userId, timestamp,
      changedColumn, oldValue, newValue — tanpa endpoint update/delete untuk tabel ini
- [ ] Soft delete: deletedAt di Task/Project; semua query memfilter deletedAt: null;
      DELETE menulis deletedAt, bukan hard delete
- [ ] Race condition test: dua write bersamaan → satu berhasil, satu 409

## Fase 4 — Frontend per-role (task board + views) ✅
> Dikerjakan sebelum Fase 3 atas permintaan; locking/audit/soft delete masih terbuka.
- [x] Layout aplikasi per-role — `components/app-shell.tsx` (nav Dashboard/Board, guard,
      user menu) + route group `(app)`
- [x] Task board: visualisasi dependensi + state Blocked (memakai `blocked` turunan backend)
- [x] View PM: create/edit task, assign engineer, toggle clientVisible, define/remove
      dependensi, delete
- [x] View Engineer: transisi status (Start/Complete) sesuai state-based rules + upload attachment
- [x] View Client: dashboard aggregate (`% complete`, counts) + hanya task clientVisible,
      read-only
- [x] Loading, empty, error state di setiap list/view
- [x] Responsive + palet NodeWave (primary #094C86, accent #50B1D2, surface
      #F6F9FC/#0F1B24, font Urbanist)
- [x] Catat asumsi: kontrak pagination SharePoint internal tak bisa diverifikasi,
      kontrak existing dipakai (lihat Catatan keputusan)

## Fase 5 — Deployment practice (opsional)
> Brief mewajibkan deploy hanya untuk submission; tanpa submission (keputusan di
> bawah) fase ini tetap opsional. Arsitektur doc tetap disarankan sebagai latihan.
- [ ] Deploy backend (Railway/Render — rekomendasi; atau Fly.io/VPS) + PostgreSQL + migrations + seeds
- [ ] Deploy frontend (Vercel/sejenis) → NEXT_PUBLIC_BE_URL → backend live
- [ ] Verifikasi login live: PM, Engineer, Client Guest
- [ ] Tulis architecture overview: RBAC+ABAC, state-based permissions, dependensi,
      concurrency, audit trail (latihan menulis doc arsitektur)
- [ ] (Opsional) Screenshots + screen recording flow aplikasi
- [ ] (Opsional) Invite rigenski & nodewavescout — hanya jika ingin latihan kolaborasi

## Fase 6 — Backlog belajar
> Brief menandai testing & CI sebagai **opsional** — backlog ini bukan kelalaian.
- [ ] Daily standup auto-summary: endpoint/job merangkum audit trail hari sebelumnya →
      JSON terstruktur ("selesai kemarin" / "terblokir hari ini") per departemen
      (bonus di brief)
- [ ] Unit tests: minimal 1 test service/repository (backend) + 1 komponen UI kunci
- [ ] CI: GitHub Actions — format + lint + build

## Housekeeping
- [x] Commit apps/frontend/AGENTS.md + CLAUDE.md (auto-generated next dev; meng-commit
      menjaga tree bersih)
- [x] Nasib .serena/ — selesai via keputusan: folder di-commit mengikuti konvensi
      Serena sendiri (nested .gitignore mengurus cache/ + project.local.yml)

## Catatan keputusan
- **Login menampilkan akun demo** — halaman login punya panel akun (PM, QA, Frontend,
  Backend, Client) dengan tombol "Use"; subtitle dashboard disesuaikan per role.
- **Dependency saat create** — `createTaskSchema` menerima `dependencyIds` (maks 20,
  duplikat di-dedupe, wajib satu project, tanpa cek cycle karena task baru belum punya
  dependent). UI memakai `DependencyPicker` bersama (create + edit).
- **UX board (revisi)** — engineer default filter **"My tasks"** (toggle "All project
  tasks"); task blocked menampilkan **Start disabled + alasan dependency**; task milik
  orang lain ditandai read-only; ukuran kartu/teks/padding dinaikkan; attachment
  menerima gambar & dokumen (`accept`).
- **Fase 3 ditunda** — FE dikerjakan lebih dulu atas permintaan; optimistic locking,
  audit trail, dan soft delete tetap terbuka.
- **FE contract mirror disamakan** — task (`blocked`, `dependencies`, `attachments`),
  stats, users, dan `updateTaskSchema` eksplisit tanpa default (bug Zod `.partial()`).
- **UI lock client-side** — tombol Start/Complete/Edit/Attach digate memakai role +
  `assigneeId` + `blocked` dari server; server tetap sumber kebenaran (403 tetap ada).
- **`GET /api/users` (PM-only)** — direktori engineer untuk assignee picker.
- **PM tidak boleh menyelesaikan task** — lebih ketat dari brief: PM dilarang set
  status `done` dari state mana pun; hanya assignee (executor) yang boleh.
- **Engineer actions = assigned-only** — ubah status & upload attachment hanya pada
  task yang `assigneeId`-nya dirinya; task lain di project member tetap bisa dibaca.
- **Attachment storage** — file di `apps/backend/uploads/` (gitignored) + metadata di
  DB; `Attachment.url` menyimpan nama file server-side, API hanya mengekspos
  `/api/attachments/:id/download`. Volume container dicatat untuk Fase 5.
- **UI lock ditunda** — keputusan user: selesaikan backend dulu; tombol aksi terkunci
  dikerjakan di Fase 4 saat action UI ada.
- **Zod 4 `.partial()` retains `.default()`** — PATCH `{status}` sempat ikut membawa
  `priority`/`clientVisible`; `updateTaskSchema` sekarang eksplisit tanpa default.
- **Port database dev** — default repo adalah **5432** (`.env`, `.env.example`,
  `db-up.sh`, kedua compose file, README, AGENTS.md §11 semuanya 5432). Catatan lama
  "container dev dipindah ke 5433" ternyata **tidak cocok dengan kode**; host
  `postgresql.service` di mesin ini sedang *inactive*, jadi 5432 bebas dipakai.
  Jika suatu saat host Postgres menempati 5432, pakai escape hatch:
  `POSTGRES_PORT=5433 bun run db:up` lalu samakan `DATABASE_URL` di
  apps/backend/.env ke 5433 (jalur ini belum diuji di mesin ini).
  Catatan alur Prisma: `migrate reset` hanya REPLAY file migration yang sudah ada —
  schema change = `db:migrate` dulu (generate + apply), baru `db:seed`.
- **Monorepo dipertahankan** — keputusan sadar untuk project latihan; brief aslinya
  meminta dua repo terpisah. Tidak ada konsekuensi submission.
- **Tanpa deadline** — brief dipakai sebagai spec belajar. Fase 2 & 3 adalah inti
  pembelajaran (state-based permissions + concurrency), boleh dieksplorasi lebih dalam.
- **Kontrak pagination** — doc SharePoint internal NodeWave diasumsikan tak bisa
  diakses; kontrak existing (page/rows/search/status/orderKey/orderRule) dipakai.
- **packages/shared** — AGENTS.md §7 menganjurkan promosi kontrak ke workspace
  `packages/shared` saat tumbuh; Fase 1 membuat kontrak tumbuh >handful schemas.
  Promosi direkomendasikan, **butuh persetujuan eksplisit** (AGENTS.md §13).
- **Nama env var frontend** — brief memakai `NEXT_PUBLIC_BE_URL`, kode lama memakai
  `NEXT_PUBLIC_API_URL`. Diputuskan mengikuti brief: kode di-rename ke
  `NEXT_PUBLIC_BE_URL` di semua titik (env.ts, .env.example, README, Dockerfile,
  compose ×2, AGENTS.md §12). Nilai di-inline saat build → ganti butuh rebuild image.
- **Komentar internal** — brief meminta masking "internal comment history", tetapi
  skema tidak punya model Comment dan tidak ada fitur komentar. Diputuskan: keluarkan
  komentar dari lingkup masking Fase 2. Jika fitur komentar ditambahkan, masking Client
  WAJIB diperluas ke sana (jangan lupa update catatan ini).
- **Desain sesi Fase 1** — transport: **cookie httpOnly `ps_token`** (SameSite=Lax,
  secure hanya di production), bukan bearer token — `AUTH_COOKIE`, CORS
  `credentials: true`, dan Axios `withCredentials` sudah disiapkan dari awal.
  Register **terbuka** dengan field `role`/`department` (department wajib untuk
  engineer). Guard Fase 1 = tasks + projects (autentikasi saja); otorisasi per-peran
  menyusul di Fase 2. Guard UI **client-side** (tanpa `jose`/edge middleware) — cukup
  untuk sekarang, layout per-peran server-side masuk Fase 4.
  Catatan: logout hanya menghapus cookie; JWT stateless tetap valid sampai 7 hari
  (revocation/denylist opsional nanti). Di deploy lintas-site (Fase 5) cookie butuh
  SameSite=None; Secure + origin frontend di `CORS_ORIGIN`.
