import { Router } from "express";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

// GET /admin/stats — statistiques globales de la plateforme
adminRouter.get("/stats", async (_req, res) => {
  const [users, trainers, students, courses, paidOrders] = await Promise.all([
    prisma.user.count(),
    prisma.trainer.count(),
    prisma.student.count(),
    prisma.course.count(),
    prisma.order.findMany({ where: { status: "PAID" } }),
  ]);

  res.json({
    totalUsers: users,
    totalTrainers: trainers,
    totalStudents: students,
    totalCourses: courses,
    totalRevenue: paidOrders.reduce((sum, o) => sum + o.amount, 0),
    totalPaidOrders: paidOrders.length,
  });
});

// GET /admin/users — liste de tous les utilisateurs
adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// PATCH /admin/users/:id/deactivate — suspendre un compte
adminRouter.patch("/users/:id/deactivate", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ id: user.id, isActive: user.isActive });
});

// GET /admin/courses — toutes les formations de la plateforme
adminRouter.get("/courses", async (_req, res) => {
  const courses = await prisma.course.findMany({
    include: { trainer: { select: { publicName: true } }, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(courses);
});

// GET /admin/payments — tous les paiements
adminRouter.get("/payments", async (_req, res) => {
  const payments = await prisma.payment.findMany({
    include: { order: { include: { course: { select: { title: true } }, student: { include: { user: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(payments);
});
