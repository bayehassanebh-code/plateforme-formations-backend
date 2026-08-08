import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";
import { storage } from "@/utils/storage";

export const modulesRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2 Go max / vidéo

async function assertCourseOwnership(courseId: string, userId: string) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!trainer || !course || course.trainerId !== trainer.id) {
    return null;
  }
  return course;
}

const createModuleSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(2),
  order: z.number().int().nonnegative().optional(),
});

// POST /modules — ajouter un module à une formation
modulesRouter.post("/", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const parsed = createModuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const course = await assertCourseOwnership(parsed.data.courseId, req.user!.userId);
  if (!course) return res.status(404).json({ error: "Formation introuvable." });

  const count = await prisma.module.count({ where: { courseId: course.id } });
  const module = await prisma.module.create({
    data: {
      courseId: course.id,
      title: parsed.data.title,
      order: parsed.data.order ?? count,
    },
  });
  res.status(201).json(module);
});

// PATCH /modules/reorder — réordonner les modules d'une formation
modulesRouter.patch("/reorder", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const schema = z.object({
    courseId: z.string().uuid(),
    orderedModuleIds: z.array(z.string().uuid()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const course = await assertCourseOwnership(parsed.data.courseId, req.user!.userId);
  if (!course) return res.status(404).json({ error: "Formation introuvable." });

  await prisma.$transaction(
    parsed.data.orderedModuleIds.map((id, index) =>
      prisma.module.update({ where: { id }, data: { order: index } })
    )
  );
  res.json({ success: true });
});

// --- Leçons (vidéo ou document) dans un module -----------------------------

// POST /modules/:moduleId/lessons — ajoute une leçon avec upload direct du fichier
modulesRouter.post(
  "/:moduleId/lessons",
  requireAuth,
  requireRole("TRAINER"),
  upload.single("file"),
  async (req, res) => {
    const bodySchema = z.object({
      title: z.string().min(2),
      type: z.enum(["VIDEO", "DOCUMENT"]),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (!req.file) return res.status(400).json({ error: "Fichier manquant." });

    const module = await prisma.module.findUnique({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.userId } });
    if (!module || !trainer || module.course.trainerId !== trainer.id) {
      return res.status(404).json({ error: "Module introuvable." });
    }

    const count = await prisma.lesson.count({ where: { moduleId: module.id } });
    const folder = parsed.data.type === "VIDEO" ? "videos" : "documents";
    const storageKey = await storage.uploadBuffer(req.file.buffer, req.file.originalname, folder);

    const lesson = await prisma.lesson.create({
      data: {
        moduleId: module.id,
        title: parsed.data.title,
        type: parsed.data.type,
        order: count,
        ...(parsed.data.type === "VIDEO"
          ? { video: { create: { storageKey } } }
          : { document: { create: { storageKey, fileName: req.file.originalname } } }),
      },
      include: { video: true, document: true },
    });

    res.status(201).json(lesson);
  }
);
