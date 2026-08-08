import { PaymentMethod } from "@prisma/client";

/**
 * Interface commune à tous les moyens de paiement.
 * Chaque provider (Wave, Orange Money, MTN MoMo, Stripe...) implémente
 * cette interface. Le reste de l'application ne dépend jamais d'un
 * provider précis, ce qui permet d'ajouter un nouveau moyen de paiement
 * sans toucher aux routes ou à la logique métier.
 */
export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customer: { name: string; emailOrPhone: string };
}

export interface CreatePaymentResult {
  providerRef: string;
  /** URL ou instructions à présenter au client pour finaliser le paiement */
  redirectUrl?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  providerRef: string;
  rawData?: unknown;
}

export interface PaymentProvider {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  verifyPayment(providerRef: string): Promise<VerifyPaymentResult>;
}

/**
 * Provider de démonstration : simule un paiement toujours réussi.
 * À remplacer par de vraies intégrations (Wave, Orange Money, MTN MoMo, Stripe...)
 * en implémentant PaymentProvider pour chacune.
 */
class MockPaymentProvider implements PaymentProvider {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const providerRef = `mock_${params.orderId}_${Date.now()}`;
    return {
      providerRef,
      redirectUrl: `https://payment.example.com/pay/${providerRef}`,
    };
  }

  async verifyPayment(providerRef: string): Promise<VerifyPaymentResult> {
    return { success: true, providerRef, rawData: { simulated: true } };
  }
}

const providers: Record<string, PaymentProvider> = {
  mock: new MockPaymentProvider(),
  // wave: new WavePaymentProvider(),
  // orange_money: new OrangeMoneyPaymentProvider(),
  // mtn_momo: new MtnMomoPaymentProvider(),
  // stripe: new StripePaymentProvider(),
};

export function getPaymentProvider(name?: string): PaymentProvider {
  const key = name || process.env.PAYMENT_DEFAULT_PROVIDER || "mock";
  const provider = providers[key];
  if (!provider) {
    throw new Error(`Fournisseur de paiement inconnu : ${key}`);
  }
  return provider;
}
