import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { verifyToken, JwtPayload } from "@/utils/auth";

// Étend le type Request pour porter l'utilisateur authentifié
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Vérifie la présence et la validité du token JWT (header Authorization: Bearer <token>).
 * Bloque la requête si le token est absent ou invalide.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré." });
  }
}

/**
 * Restreint l'accès à une route à une liste de rôles autorisés.
 * À utiliser après requireAuth.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentification requise." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour ce rôle." });
    }
    next();
  };
}
