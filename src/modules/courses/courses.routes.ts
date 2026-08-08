import { Router } from "express";
import { z } from "zod";
import slugify from "slugify";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";

export const coursesRouter = Router();

async function getTrainerIdOrFail(userId: string) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new Error("NOT_A_TRAINER");
  return trainer.id;
}

// --- Espace formateur ---------------------------------------------------

const createCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  coverImage: z.string().url().optional(),
  price: z.number().int().nonnegative(),
  currency: z.string().default("XOF"),
  category: z.string().optional(),
});

// POST /courses — créer une formation (brouillon)
coursesRouter.post("/", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const trainerId = await getTrainerIdOrFail(req.user!.userId);
  const { title, ...rest } = parsed.data;

  const course = await prisma.course.create({
    data: {
      trainerId,
      title,
      slug: `${slugify(title, { lower: true })}-${Date.now().toString(36)}`,
      ...rest,
    },
  });

  res.status(201).json(course);
});

// GET /courses/mine — mes formations (formateur connecté)
coursesRouter.get("/mine", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const trainerId = await getTrainerIdOrFail(req.user!.userId);
  const courses = await prisma.course.findMany({
    where: { trainerId },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(courses);
});

const updateCourseSchema = createCourseSchema.partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

// PATCH /courses/:id — modifier une formation (le formateur doit en être propriétaire)
coursesRouter.patch("/:id", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const trainerId = await getTrainerIdOrFail(req.user!.userId);
  const course = await prisma.course.findUnique({ where: { id: req.params.id } });
  if (!course || course.trainerId !== trainerId) {
    return res.status(404).json({ error: "Formation introuvable." });
  }

  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: parsed.data,
  });
  res.json(updated);
});

// --- Pages publiques ------------------------------------------------------

// GET /courses/public/:slug — page de vente publique (aucune donnée privée exposée)
coursesRouter.get("/public/:slug", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { slug: req.params.slug },
    include: {
      trainer: { select: { publicName: true, avatarUrl: true, bio: true } },
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, type: true, order: true }, // pas de storageKey ici
          },
        },
      },
    },
  });

  if (!course || course.status !== "PUBLISHED") {
    return res.status(404).json({ error: "Formation introuvable." });
  }

  res.json(course);
});
