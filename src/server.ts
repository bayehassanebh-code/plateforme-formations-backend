import "dotenv/config";
import "express-async-errors"; // permet aux erreurs des routes async d'atteindre le middleware d'erreurs
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { authRouter } from "@/modules/auth/auth.routes";
import { coursesRouter } from "@/modules/courses/courses.routes";
import { trainerDashboardRouter } from "@/modules/courses/trainer-dashboard.routes";
import { modulesRouter } from "@/modules/modules/modules.routes";
import { ordersRouter } from "@/modules/orders/orders.routes";
import { paymentsRouter } from "@/modules/payments/payments.routes";
import { enrollmentsRouter } from "@/modules/enrollments/enrollments.routes";
import { adminRouter } from "@/modules/admin/admin.routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/courses", coursesRouter);
app.use("/trainer", trainerDashboardRouter);
app.use("/modules", modulesRouter);
app.use("/orders", ordersRouter);
app.use("/payments", paymentsRouter);
app.use("/enrollments", enrollmentsRouter);
app.use("/admin", adminRouter);

// Gestion centralisée des erreurs
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err.message === "NOT_A_TRAINER") {
    return res.status(403).json({ error: "Compte formateur requis." });
  }
  res.status(500).json({ error: "Erreur interne du serveur." });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`API démarrée sur http://localhost:${PORT}`);
});
