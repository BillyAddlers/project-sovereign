/**
 * Development seed. Run with `bun run db:seed`.
 *
 * Idempotent: rows are matched on their natural key (email, project name,
 * task title within the demo project), so re-running tops the table up
 * instead of duplicating it.
 *
 * The dependency chain mirrors the assessment brief's example: UI Design and
 * Backend API Integration are prerequisites for Frontend Slicing, which
 * therefore starts out blocked — exactly the state the Fase 2 permission
 * rules must act on.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth";
import { createTaskSchema } from "@/lib/schemas";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DEMO_PASSWORD = "password123";

/** Map lookups in seed data are invariants, not possibilities — fail loudly. */
function mustGet(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`Seed invariant broken: no row for ${key}`);
  return value;
}

// --- Users -----------------------------------------------------------------

// One hash for every account: they all share DEMO_PASSWORD, and argon2id is
// deliberately slow, so hashing five times would only slow the seed down.
const passwordHash = await hashPassword(DEMO_PASSWORD);

const users = [
  { email: "pm@demo.local", name: "Paul PM", role: "pm" as const, department: null },
  {
    email: "uiux@demo.local",
    name: "Uma UI/UX",
    role: "engineer" as const,
    department: "uiux" as const,
  },
  {
    email: "frontend@demo.local",
    name: "Freddy Frontend",
    role: "engineer" as const,
    department: "frontend" as const,
  },
  {
    email: "backend@demo.local",
    name: "Bella Backend",
    role: "engineer" as const,
    department: "backend" as const,
  },
  { email: "client@demo.local", name: "Cindy Client", role: "client" as const, department: null },
];

const userByEmail = new Map<string, string>();

for (const user of users) {
  const row = await prisma.user.upsert({
    where: { email: user.email },
    create: { ...user, passwordHash },
    update: { name: user.name, role: user.role, department: user.department, passwordHash },
  });
  userByEmail.set(user.email, row.id);
}

// --- Project ----------------------------------------------------------------

const PROJECT_NAME = "Website Redesign";
const PROJECT_DESCRIPTION = "Marketing site refresh for the flagship product.";

let project = await prisma.project.findFirst({ where: { name: PROJECT_NAME } });
if (project) {
  project = await prisma.project.update({
    where: { id: project.id },
    data: { description: PROJECT_DESCRIPTION, clientId: mustGet(userByEmail, "client@demo.local") },
  });
} else {
  project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description: PROJECT_DESCRIPTION,
      clientId: mustGet(userByEmail, "client@demo.local"),
    },
  });
}

// --- Project members ----------------------------------------------------------

// PM + the three engineers can all see the project; the client sees it through
// the clientId relation and never becomes a member.
const memberEmails = [
  "pm@demo.local",
  "uiux@demo.local",
  "frontend@demo.local",
  "backend@demo.local",
];

for (const email of memberEmails) {
  const userId = mustGet(userByEmail, email);
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: { projectId: project.id, userId },
    update: {},
  });
}

// --- Tasks + dependencies ------------------------------------------------------

interface TaskSeed {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  assigneeEmail: string | null;
  clientVisible: boolean;
}

const taskSeeds: TaskSeed[] = [
  {
    title: "UI Design",
    description: "Homepage and pricing page mockups in Figma.",
    priority: "high",
    status: "done",
    assigneeEmail: "uiux@demo.local",
    clientVisible: true,
  },
  {
    title: "Backend API Integration",
    description: "Wire the public API endpoints for the marketing site.",
    priority: "high",
    status: "in_progress",
    assigneeEmail: "backend@demo.local",
    clientVisible: true,
  },
  {
    title: "Frontend Slicing",
    description: "Turn the approved mockups into Next.js pages.",
    priority: "medium",
    status: "todo",
    assigneeEmail: "frontend@demo.local",
    clientVisible: false,
  },
];

const taskIdsByTitle = new Map<string, string>();

for (const seed of taskSeeds) {
  // Validate through the same schema the API uses, so seed data can never
  // introduce a row the endpoint would reject.
  const data = createTaskSchema.parse({
    title: seed.title,
    description: seed.description,
    priority: seed.priority,
    projectId: project.id,
    assigneeId: seed.assigneeEmail ? mustGet(userByEmail, seed.assigneeEmail) : undefined,
    clientVisible: seed.clientVisible,
  });

  const existing = await prisma.task.findFirst({
    where: { title: seed.title, projectId: project.id },
  });

  const row = existing
    ? await prisma.task.update({
        where: { id: existing.id },
        data: { ...data, status: seed.status },
      })
    : await prisma.task.create({ data: { ...data, status: seed.status } });

  taskIdsByTitle.set(seed.title, row.id);
}

const dependencySeeds = [
  {
    taskId: mustGet(taskIdsByTitle, "Frontend Slicing"),
    dependsOnId: mustGet(taskIdsByTitle, "UI Design"),
  },
  {
    taskId: mustGet(taskIdsByTitle, "Frontend Slicing"),
    dependsOnId: mustGet(taskIdsByTitle, "Backend API Integration"),
  },
];

for (const dependency of dependencySeeds) {
  const existing = await prisma.taskDependency.findFirst({
    where: { taskId: dependency.taskId, dependsOnId: dependency.dependsOnId },
  });
  if (!existing) {
    await prisma.taskDependency.create({ data: dependency });
  }
}

// --- Report --------------------------------------------------------------------

const [userCount, taskCount] = await Promise.all([prisma.user.count(), prisma.task.count()]);
console.log(`Seeded. ${userCount} user(s), ${taskCount} task(s) in the database.`);
console.log(`Demo accounts — password for all: ${DEMO_PASSWORD}`);
for (const user of users) {
  const department = user.department ? `/${user.department}` : "";
  console.log(`  - ${user.email} (${user.role}${department})`);
}

await prisma.$disconnect();
