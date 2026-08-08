import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";
import { storage } from "@/utils/storage";

export const enrollmentsRouter = Router();

// GET /enrollments/mine — "Mes formations" avec progression
enrollmentsRouter.get("/mine", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.userId } });
  if (!student) return res.status(403).json({ error: "Compte client requis." });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: {
      course: {
        include: {
          trainer: { select: { publicName: true } },
          modules: { include: { lessons: true } },
        },
      },
      lessonProgress: true,
    },
  });

  const result = enrollments.map((e) => {
    const totalLessons = e.course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const completed = e.lessonProgress.filter((p) => p.completed).length;
    return {
      courseId: e.course.id,
      title: e.course.title,
      coverImage: e.course.coverImage,
      trainerName: e.course.trainer.publicName,
      progressPercent: totalLessons ? Math.round((completed / totalLessons) * 100) : 0,
    };
  });

  res.json(result);
});

// GET /enrollments/:courseId/content — contenu complet de la formation (client propriétaire uniquement)
enrollmentsRouter.get("/:courseId/content", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.userId } });
  if (!student) return res.status(403).json({ error: "Compte client requis." });

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId: req.params.courseId } },
  });
  if (!enrollment) {
    return res.status(403).json({ error: "Vous n'avez pas accès à cette formation." });
  }

  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });

  res.json(course);
});

// GET /enrollments/lessons/:lessonId/access — génère une URL signée temporaire pour une leçon
// (jamais l'URL brute du stockage : évite tout accès direct/non autorisé)
enrollmentsRouter.get("/lessons/:lessonId/access", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.userId } });
  if (!student) return res.status(403).json({ error: "Compte client requis." });

  const lesson = await prisma.lesson.findUnique({
    where: { id: req.params.lessonId },
    include: { module: { include: { course: true } }, video: true, document: true },
  });
  if (!lesson) return res.status(404).json({ error: "Leçon introuvable." });

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: { studentId: student.id, courseId: lesson.module.course.id },
    },
  });
  if (!enrollment) {
    return res.status(403).json({ error: "Vous n'avez pas accès à cette formation." });
  }

  const storageKey = lesson.video?.storageKey ?? lesson.document?.storageKey;
  if (!storageKey) return res.status(404).json({ error: "Contenu introuvable." });

  const url = await storage.getSignedDownloadUrl(storageKey);
  res.json({ url, type: lesson.type });
});

// POST /enrollments/lessons/:lessonId/complete — marquer une leçon comme terminée
enrollmentsRouter.post("/lessons/:lessonId/complete", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.userId } });
  if (!student) return res.status(403).json({ error: "Compte client requis." });

  const lesson = await prisma.lesson.findUnique({
    where: { id: req.params.lessonId },
    include: { module: true },
  });
  if (!lesson) return res.status(404).json({ error: "Leçon introuvable." });

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: { studentId: student.id, courseId: lesson.module.courseId },
    },
  });
  if (!enrollment) return res.status(403).json({ error: "Accès refusé." });

  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
    update: { completed: true, completedAt: new Date() },
    create: { enrollmentId: enrollment.id, lessonId: lesson.id, completed: true, completedAt: new Date() },
  });

  res.json(progress);
});
