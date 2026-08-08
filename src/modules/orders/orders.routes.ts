import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";
import { getPaymentProvider } from "@/payments/provider";

export const ordersRouter = Router();

const createOrderSchema = z.object({
  courseSlug: z.string(),
  method: z.enum(["ORANGE_MONEY", "WAVE", "MTN_MOMO", "CARD"]),
  customerName: z.string().min(2),
  emailOrPhone: z.string().min(4),
});

// POST /orders — le client déclenche l'achat d'une formation (étape 1 à 4 du parcours)
ordersRouter.post("/", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const course = await prisma.course.findUnique({ where: { slug: parsed.data.courseSlug } });
  if (!course || course.status !== "PUBLISHED") {
    return res.status(404).json({ error: "Formation introuvable." });
  }

  const student = await prisma.student.findUnique({ where: { userId: req.user!.userId } });
  if (!student) return res.status(403).json({ error: "Compte client requis." });

  // Déjà propriétaire ? on évite un double achat
  const alreadyEnrolled = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
  });
  if (alreadyEnrolled) {
    return res.status(409).json({ error: "Vous avez déjà accès à cette formation." });
  }

  const order = await prisma.order.create({
    data: {
      studentId: student.id,
      courseId: course.id,
      amount: course.price,
      currency: course.currency,
      status: "PENDING",
    },
  });

  const provider = getPaymentProvider();
  const paymentResult = await provider.createPayment({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    method: parsed.data.method,
    customer: { name: parsed.data.customerName, emailOrPhone: parsed.data.emailOrPhone },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      method: parsed.data.method,
      providerRef: paymentResult.providerRef,
      status: "PENDING",
    },
  });

  // Le client est redirigé vers redirectUrl pour finaliser le paiement (étape 5-6 du parcours).
  res.status(201).json({
    orderId: order.id,
    redirectUrl: paymentResult.redirectUrl,
  });
});

// GET /orders/:id/status — le frontend peut sonder le statut pendant l'attente du paiement
ordersRouter.get("/:id/status", requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { payment: true, enrollment: true },
  });
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  res.json({
    status: order.status,
    hasAccess: !!order.enrollment,
  });
});
