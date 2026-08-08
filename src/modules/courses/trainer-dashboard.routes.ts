import { Router } from "express";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";

export const trainerDashboardRouter = Router();

// GET /trainer/dashboard — vue d'ensemble (Mes ventes, Mes clients, Mes revenus)
trainerDashboardRouter.get("/dashboard", requireAuth, requireRole("TRAINER"), async (req, res) => {
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.userId } });
  if (!trainer) return res.status(403).json({ error: "Compte formateur requis." });

  const paidOrders = await prisma.order.findMany({
    where: { course: { trainerId: trainer.id }, status: "PAID" },
    include: { student: { include: { user: true } }, course: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });

  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
  const uniqueClients = new Set(paidOrders.map((o) => o.studentId)).size;

  res.json({
    totalRevenue,
    totalSales: paidOrders.length,
    totalClients: uniqueClients,
    recentSales: paidOrders.slice(0, 20).map((o) => ({
      client: o.student.user.fullName,
      course: o.course.title,
      amount: o.amount,
      date: o.createdAt,
    })),
  });
});
