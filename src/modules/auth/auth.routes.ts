import { Router } from "express";
import { z } from "zod";
import slugify from "slugify";
import { prisma } from "@/config/prisma";
import { hashPassword, comparePassword, signToken } from "@/utils/auth";

export const authRouter = Router();

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["TRAINER", "STUDENT"]),
});

// POST /auth/register — inscription formateur ou client
authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { fullName, email, phone, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      phone,
      passwordHash,
      role,
      ...(role === "TRAINER"
        ? {
            trainer: {
              create: {
                publicName: fullName,
                slug: `${slugify(fullName, { lower: true })}-${Date.now().toString(36)}`,
                subscription: { create: { plan: "FREE" } },
              },
            },
          }
        : { student: { create: {} } }),
    },
    include: { trainer: true, student: true },
  });

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  });
});
