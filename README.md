# Backend — Plateforme SaaS de vente de formations

API REST pour la plateforme (Node.js + TypeScript + Express + Prisma + PostgreSQL).

## Installation

```bash
npm install
cp .env.example .env
# renseigner DATABASE_URL, JWT_SECRET, et les clés de stockage cloud dans .env

npm run prisma:generate
npm run prisma:migrate     # crée les tables en base
npm run seed                # crée le compte admin initial
npm run dev                  # démarre l'API sur http://localhost:4000
```

## Structure

```
src/
  config/prisma.ts              → client PostgreSQL
  middleware/auth.middleware.ts → requireAuth, requireRole
  utils/auth.ts                 → JWT + hash de mot de passe
  utils/storage.ts              → abstraction stockage cloud (vidéos/PDF privés)
  payments/provider.ts          → abstraction des moyens de paiement
  modules/
    auth/               → inscription (formateur/client), connexion
    courses/            → CRUD formations + dashboard formateur + page de vente publique
    modules/            → modules & leçons (upload vidéo/PDF, réordonnancement)
    orders/             → création de commande, déclenchement du paiement
    payments/           → webhook de confirmation → accès automatique
    enrollments/        → "Mes formations", accès sécurisé aux leçons, progression
    admin/               → statistiques, utilisateurs, formations, paiements globaux
  server.ts             → point d'entrée, montage des routes
prisma/
  schema.prisma          → modèle de données complet
  seed.ts                → crée le compte admin par défaut
```

## Parcours couverts

- **Formateur** : `POST /auth/register` (role=TRAINER) → `POST /courses` → `POST /modules` → `POST /modules/:id/lessons` (upload) → `PATCH /courses/:id` (status=PUBLISHED) → `GET /trainer/dashboard`
- **Client** : `POST /auth/register` (role=STUDENT) → `GET /courses/public/:slug` → `POST /orders` → paiement via le provider → `POST /payments/webhook` (accès auto) → `GET /enrollments/mine` → `GET /enrollments/lessons/:id/access` (URL signée temporaire)
- **Admin** : `GET /admin/stats`, `/admin/users`, `/admin/courses`, `/admin/payments`

## Sécurité

- Vidéos/PDF jamais exposés publiquement : URL signée temporaire générée à la demande (`storage.getSignedDownloadUrl`), après vérification que le client a bien un `enrollment` actif sur la formation.
- Chaque route vérifie la propriété (un formateur ne peut modifier que ses propres formations ; un client ne voit que ses propres formations achetées).
- Paiement confirmé uniquement via webhook + vérification côté provider (`verifyPayment`), jamais en faisant confiance à une requête du frontend seule.

## Prochaine étape

Implémenter un vrai `PaymentProvider` (Wave, Orange Money, MTN MoMo...) dans `src/payments/provider.ts` et un vrai `StorageProvider` S3/R2 dans `src/utils/storage.ts` — le reste de l'application n'a pas besoin de changer grâce à l'abstraction.
