import path from "node:path";

import { Hono } from "hono";

import { projectAccessFor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { canViewAttachment } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const attachments = new Hono<AppEnv>();

attachments.use("*", requireAuth);

/** GET /api/attachments/:id/download — streams a file after a permission check. */
attachments.get("/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await prisma().attachment.findFirst({
    where: { id },
    include: { task: { select: { projectId: true } } },
  });
  if (!row) throw AppError.notFound("Attachment was not found");

  // 404 (not 403) for invisible attachments: do not confirm their existence.
  const access = await projectAccessFor(user.id, row.task.projectId);
  if (!access || !canViewAttachment(user, access)) {
    throw AppError.notFound("Attachment was not found");
  }

  const file = Bun.file(path.join(process.cwd(), "uploads", row.url));
  if (!(await file.exists())) throw AppError.notFound("Attachment file is missing");

  return c.body(file.stream(), 200, {
    "Content-Type": row.mimeType,
    "Content-Disposition": `attachment; filename="${row.filename.replace(/["\\\r\n]/g, "_")}"`,
  });
});
