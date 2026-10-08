# TODO — Project Sovereign

> Sumber kebenaran: **Fullstack Engineer Assessment Brief** (NodeWave) —
> `docs/assessment-brief.docx`.
> Konteks: **project latihan & eksplorasi** — tidak ada deadline, tidak ada submission.
>   Brief dipakai sebagai spec belajar; item submission bersifat opsional.
> Keputusan struktur: **monorepo dipertahankan secara sadar** (deviasi dari brief
>   "two separate repos" — tidak relevan untuk latihan, tapi tetap dicatat).
> Terakhir diperbarui: 2026-10-05

## Status ringkas

| Fase | Nama                            | Status        |
|------|---------------------------------|---------------|
| 0    | Fondasi monorepo                | ✅ Selesai    |
| 1    | Domain model + Auth JWT         | 🔄 Berjalan |
| 2    | Authorization core              | ⬜            |
| 3    | Concurrency + audit trail       | ⬜            |
| 4    | Frontend per-role (task board)  | ⬜            |
| 5    | Deployment practice (opsional)  | ⬜            |
| 6    | Backlog belajar                 | ⬜            |

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
- [ ] Data masking level API: nama/avatar/departemen engineer + komentar internal
      di-strip dari response Client (bukan disembunyikan via CSS)
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
- [ ] Task board: visualisasi dependensi + state Blocked (dihitung otomatis dari dependensi)
- [ ] View PM: edit task, define dependensi, toggle clientVisible
- [ ] View Engineer: transisi status sesuai state-based rules + upload attachment
- [ ] View Client: dashboard aggregate ("50% Complete") + hanya task clientVisible
- [ ] Loading, empty, error state di setiap list/view
- [ ] Responsive + palet NodeWave: primary #094C86/#0C77F8, accent #50B1D2,
      surface #F6F9FC/#0F1B24, font Urbanist
- [ ] Catat asumsi: kontrak pagination SharePoint internal tak bisa diverifikasi,
      kontrak existing dipakai

## Fase 5 — Deployment practice (opsional)
- [ ] Deploy backend (Railway/Render — rekomendasi; atau Fly.io/VPS) + PostgreSQL + migrations + seeds
- [ ] Deploy frontend (Vercel/sejenis) → NEXT_PUBLIC_BE_URL → backend live
- [ ] Verifikasi login live: PM, Engineer, Client Guest
- [ ] Tulis architecture overview: RBAC+ABAC, state-based permissions, dependensi,
      concurrency, audit trail (latihan menulis doc arsitektur)
- [ ] (Opsional) Screenshots + screen recording flow aplikasi
- [ ] (Opsional) Invite rigenski & nodewavescout — hanya jika ingin latihan kolaborasi

## Fase 6 — Backlog belajar
- [ ] Daily standup auto-summary: endpoint/job merangkum audit trail hari sebelumnya →
      JSON terstruktur ("selesai kemarin" / "terblokir hari ini") per departemen
- [ ] Unit tests: minimal 1 test service/repository (backend) + 1 komponen UI kunci
- [ ] CI: GitHub Actions — format + lint + build

## Housekeeping
- [x] Commit apps/frontend/AGENTS.md + CLAUDE.md (auto-generated next dev; meng-commit
      menjaga tree bersih)
- [x] Nasib .serena/ — selesai via keputusan: folder di-commit mengikuti konvensi
      Serena sendiri (nested .gitignore mengurus cache/ + project.local.yml)

## Catatan keputusan
- **Port database dev** — host ini menjalankan `postgresql.service` di 5432, jadi
  container dev dipindah ke **5433**: start dengan `POSTGRES_PORT=5433 bun run db:up`,
  `DATABASE_URL` di apps/backend/.env menunjuk 5433. Catatan alur Prisma:
  `migrate reset` hanya REPLAY file migration yang sudah ada — schema change =
  `db:migrate` dulu (generate + apply), baru `db:seed`.
- **Monorepo dipertahankan** — keputusan sadar untuk project latihan; brief aslinya
  meminta dua repo terpisah. Tidak ada konsekuensi submission.
- **Tanpa deadline** — brief dipakai sebagai spec belajar. Fase 2 & 3 adalah inti
  pembelajaran (state-based permissions + concurrency), boleh dieksplorasi lebih dalam.
- **Kontrak pagination** — doc SharePoint internal NodeWave diasumsikan tak bisa
  diakses; kontrak existing (page/rows/search/status/orderKey/orderRule) dipakai.
- **packages/shared** — AGENTS.md §7 menganjurkan promosi kontrak ke workspace
  `packages/shared` saat tumbuh; Fase 1 membuat kontrak tumbuh >handful schemas.
  Promosi direkomendasikan, **butuh persetujuan eksplisit** (AGENTS.md §13).
