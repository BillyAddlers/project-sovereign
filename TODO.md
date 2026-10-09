# TODO — Project Sovereign

> Sumber kebenaran: **Fullstack Engineer Assessment Brief** (NodeWave) —
> `docs/assessment-brief.md` (transkripsi rapi; dokumen asli: `docs/assessment-brief.docx`).
> Konteks: **project latihan & eksplorasi** — tidak ada deadline, tidak ada submission.
>   Brief dipakai sebagai spec belajar; item submission bersifat opsional.
> Keputusan struktur: **monorepo dipertahankan secara sadar** (deviasi dari brief
>   "two separate repos" — tidak relevan untuk latihan, tapi tetap dicatat).
> Terakhir diperbarui: 2026-10-09

## Status ringkas

| Fase | Nama                            | Status        |
|------|---------------------------------|---------------|
| 0    | Fondasi monorepo                | ✅ Selesai    |
| 0b   | Langkah 0: keputusan & fix kecil | ✅ Selesai    |
| 1    | Domain model + Auth JWT         | 🔄 Berjalan |
| 2    | Authorization core              | ⬜            |
| 3    | Concurrency + audit trail       | ⬜            |
| 4    | Frontend per-role (task board)  | ⬜            |
| 5    | Deployment practice (opsional)  | ⬜            |
| 6    | Backlog belajar                 | ⬜            |

Urutan eksekusi: **0b → 1 (selesaikan) → 2 → 3 → 4 → 5/6**. Alasan: guard butuh
identitas (1→2), service izin adalah sumber kebenaran kunci tombol UI (2→4),
audit/locking backend-internal mendahului UI yang mendemokannya (3→4).
Langkah 0 murah sekarang, jadi rework di tengah fase.

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
- [x] Skema Prisma: `User` (role: PM/ENGINEER/CLIENT, department: UIUX/FRONTEND/BACKEND),
      `Project`, `TaskDependency`, `AuditLog`, `Attachment`
      (apps/backend/prisma/schema.prisma)
- [x] Extend `Task`: projectId, assigneeId, clientVisible, deletedAt, version
- [x] `bun run db:generate && bun run db:migrate` setelah skema berubah
      (migration 20261004174035)
- [x] Kontrak API baru di backend/src/lib/schemas.ts + mirror frontend
      (packages/shared ditunda — duplikasi dipertahankan, lihat Catatan keputusan)
- [ ] Auth JWT: register, login, logout (jsonwebtoken) + hash password
      ← lib/auth.ts (hash Bun.password + sign/verify JWT) sudah ada;
        routes /api/auth/* belum (Step 5)
- [ ] Middleware auth + guard di semua endpoint tasks (apps/backend/src/) ← Step 6
- [x] Seed: akun PM, Engineer (UIUX/Frontend/Backend), Client Guest + 1 project
      contoh dengan rantai dependensi (apps/backend/prisma/seed.ts) — terverifikasi di DB
### Frontend
- [ ] Halaman login (RHF+Zod), penyimpanan sesi, logout
- [ ] Auth guard: protected routes di UI (redirect ke /login)
- [x] Baca node_modules/next/dist/docs/ SEBELUM menulis kode frontend (Next 16 breaking changes)

## Fase 2 — Authorization core (RBAC + ABAC + state-based permissions)
> Inti pembelajaran #1 — "permissions that change based on task status".
- [ ] Service izin terpusat — satu-satunya sumber keputusan izin
- [ ] PM: read/write penuh, DILARANG transisi in_progress→done, boleh define dependensi
- [ ] Engineer: hanya task project assigned; set in_progress hanya jika semua dependensi
      Done; tidak boleh ubah title/description; hanya upload attachment + ubah status
- [ ] Client: hanya aggregate metrics project sendiri (mis. "% complete") +
      task clientVisible=true
- [ ] Data masking level API: nama/avatar/departemen engineer di-strip dari response
      Client (bukan disembunyikan via CSS). Komentar internal dikeluarkan dari lingkup
      sekarang (tidak ada model Comment) — perluas masking bila fitur komentar ditambah
- [ ] Endpoint upload attachment (multipart) — model `Attachment` ada di skema tapi
      nol kode upload di backend; Engineer cuma bisa attachments + status, jadi ini
      bagian inti Fase 2, bukan nice-to-have
- [ ] Guard di setiap endpoint mutasi → 403 dengan envelope error standar
- [ ] UI: tombol aksi terkunci sesuai izin (PM tanpa aksi "Done"; Engineer melihat
      "In Progress" terkunci jika dependensi belum Done)

## Fase 3 — Concurrency + audit trail + soft delete
> Inti pembelajaran #2 — "prevention of data concurrency conflicts".
- [ ] Optimistic locking: kolom `version`, PATCH menerima expectedVersion,
      versi basi → 409 Conflict
- [ ] AuditLog immutable: setiap perubahan field task mencatat userId, timestamp,
      changedColumn, oldValue, newValue — tanpa endpoint update/delete untuk tabel ini
- [ ] Soft delete: deletedAt di Task/Project; semua query memfilter deletedAt: null;
      DELETE menulis deletedAt, bukan hard delete
- [ ] Race condition test: dua write bersamaan → satu berhasil, satu 409

## Fase 4 — Frontend per-role (task board + views)
- [ ] Layout aplikasi per-role (nav, guard, user menu)
- [ ] Task board: visualisasi dependensi + state Blocked (dihitung otomatis dari
      dependensi — state turunan, bukan enum; keputusan tercatat di Langkah 0)
- [ ] View PM: edit task, define dependensi, toggle clientVisible
- [ ] View Engineer: transisi status sesuai state-based rules + upload attachment
- [ ] View Client: dashboard aggregate ("50% Complete") + hanya task clientVisible
- [ ] Loading, empty, error state di setiap list/view
- [ ] Responsive + palet NodeWave: primary #094C86/#0C77F8, accent #50B1D2,
      surface #F6F9FC/#0F1B24, font Urbanist
- [ ] Catat asumsi: kontrak pagination SharePoint internal tak bisa diverifikasi,
      kontrak existing dipakai

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
