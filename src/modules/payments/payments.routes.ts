import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { getPaymentProvider } from "@/payments/provider";

export const paymentsRouter = Router();

const webhookSchema = z.object({
  providerRef: z.string(),
  provider: z.string().optional(),
});

/**
 * POST /payments/webhook
 * Point d'entrée appelé par le fournisseur de paiement (Wave, Orange Money, MTN MoMo, Stripe...)
 * pour confirmer un paiement. C'est ici que se joue l'étape « accès automatique » :
 * paiement confirmé → order.status = PAID → enrollment créé → le client voit
 * immédiatement la formation dans « Mes formations ».
 *
 * NOTE SÉCURITÉ : en production, chaque provider a son propre mécanisme de
 * vérification de signature (ex: header X-Wave-Signature). Vérifier la
 * signature AVANT de faire confiance au payload, pour éviter qu'un tiers
 * ne déclenche de faux accès.
 */
paymentsRouter.post("/webhook", async (req, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payment = await prisma.payment.findFirst({
    where: { providerRef: parsed.data.providerRef },
    include: { order: true },
  });
  if (!payment) return res.status(404).json({ error: "Paiement introuvable." });

  const provider = getPaymentProvider(parsed.data.provider);
  const verification = await provider.verifyPayment(parsed.data.providerRef);

  if (!verification.success) {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", rawWebhookData: verification.rawData as any },
      }),
      prisma.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } }),
    ]);
    return res.json({ received: true, status: "FAILED" });
  }

  // Paiement confirmé : on active l'accès automatiquement dans une transaction atomique
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCESS", rawWebhookData: verification.rawData as any },
    });
    const order = await tx.order.update({
      where: { id: payment.orderId },
      data: { status: "PAID" },
    });
    await tx.enrollment.upsert({
      where: { studentId_courseId: { studentId: order.studentId, courseId: order.courseId } },
      update: {},
      create: { studentId: order.studentId, courseId: order.courseId, orderId: order.id },
    });
  });

  res.json({ received: true, status: "SUCCESS" });
});
