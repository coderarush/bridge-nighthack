import type { CreatePaymentRequest, Payment } from "./types.js";

// Minimal AtlasPay client stand-in for the demo. The real SDK issues
// POST /payments; here we return a deterministic success so tests are fast.
export class AtlasPayClient {
  constructor(private readonly apiKey: string) {}

  readonly payments = {
    create: async (req: CreatePaymentRequest): Promise<Payment> => {
      return {
        id: "pay_" + (req.payment_method_id || "unknown").slice(-6),
        amount: req.amount,
        currency: req.currency,
        status: "succeeded",
      };
    },
  };
}

export const atlaspay = new AtlasPayClient(process.env.ATLASPAY_API_KEY ?? "sk_demo");
