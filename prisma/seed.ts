import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@plateforme.com";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log("Admin déjà existant, rien à faire.");
    return;
  }

  const passwordHash = await bcrypt.hash("ChangeMoi123!", 10);
  await prisma.user.create({
    data: {
      fullName: "Administrateur",
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Compte admin créé :", adminEmail, "/ mot de passe : ChangeMoi123! (à changer immédiatement)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
