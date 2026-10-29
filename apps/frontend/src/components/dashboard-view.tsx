"use client";

import { useState } from "react";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { useSession } from "@/hooks/use-session";
import { useProjects } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

export function DashboardView() {
  const { data: user } = useSession();
  const projectsQuery = useProjects();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projects = projectsQuery.data?.data ?? [];
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const isPm = user?.role === "pm";

  const query = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const statusOk = status === "all" || project.status === status;
    const searchOk =
      !query ||
      project.name.toLowerCase().includes(query) ||
      (project.description ?? "").toLowerCase().includes(query);
    return statusOk && searchOk;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {user?.role === "client"
              ? "Aggregate progress for your project."
              : "Each project's progress at a glance. Select one for details."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border-input h-9 w-52 rounded-md border bg-white/60 px-3 text-sm backdrop-blur-sm dark:bg-white/[0.07]"
            placeholder="Search projects…"
            aria-label="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter projects by status"
            className="border-input h-9 rounded-md border bg-white/60 px-3 text-sm dark:bg-white/[0.07]"
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | "active" | "archived")}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          {isPm ? <CreateProjectDialog /> : null}
        </div>
      </div>

      {projectsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading projects…</p>
      ) : null}
      {projectsQuery.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(projectsQuery.error)}
        </p>
      ) : null}
      {!projectsQuery.isPending && projects.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm">
          {isPm ? "No projects yet. Create your first project to plan work." : "No projects yet."}
        </div>
      ) : null}
      {!projectsQuery.isPending && projects.length > 0 && filteredProjects.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm">
          {query || status !== "all"
            ? "No projects match the current filters."
            : "No projects yet."}
        </div>
      ) : null}

      {filteredProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              selected={project.id === selectedId}
              onSelect={() => setSelectedId(project.id)}
            />
          ))}
        </div>
      ) : null}

      {selectedProject ? (
        <ProjectDetailDialog
          project={selectedProject}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
