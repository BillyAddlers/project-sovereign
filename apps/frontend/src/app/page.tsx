import { CreateTaskForm } from "@/components/create-task-form";
import { TaskListPanel } from "@/components/task-list-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stack = [
  "Next.js 16 (App Router)",
  "React 19 + TypeScript strict",
  "Tailwind CSS 4 + shadcn/ui (Radix)",
  "TanStack Query 5 + Axios",
  "Zustand 5",
  "React Hook Form + Zod",
  "Biome + Husky + Commitlint",
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Project Sovereign</h1>
        <p className="text-muted-foreground">
          Frontend workspace. Everything below is wired to the backend API.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Stack</CardTitle>
          <CardDescription>Installed in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2">
            {stack.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create a task</CardTitle>
            <CardDescription>React Hook Form validated by a Zod resolver.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTaskForm />
          </CardContent>
        </Card>

        <TaskListPanel />
      </div>
    </main>
  );
}
