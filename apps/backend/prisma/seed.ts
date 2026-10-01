/**
 * Development seed. Run with `bun run db:seed`.
 *
 * Idempotent: existing rows are matched on their natural key, so re-running
 * tops the table up instead of duplicating it.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { createTaskSchema } from "@/lib/schemas";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const seeds = [
  { title: "Scaffold the monorepo", priority: "high", status: "done" },
  { title: "Wire the frontend to the API", priority: "high", status: "in_progress" },
  { title: "Write the onboarding docs", priority: "medium", status: "todo" },
  { title: "Add rate limiting", priority: "low", status: "todo" },
] as const;

for (const seed of seeds) {
  // Validate through the same schema the API uses, so seed data can never
  // introduce a row the endpoint would reject.
  const data = createTaskSchema.parse({ title: seed.title, priority: seed.priority });

  const existing = await prisma.task.findFirst({ where: { title: seed.title } });
  if (existing) {
    await prisma.task.update({ where: { id: existing.id }, data: { ...data, status: seed.status } });
    continue;
  }
  await prisma.task.create({ data: { ...data, status: seed.status } });
}

const count = await prisma.task.count();
console.log(`Seeded. ${count} task(s) in the database.`);

await prisma.$disconnect();
