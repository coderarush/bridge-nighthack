import { atlaspay } from "../atlaspay/client.js";
import type { CreatePaymentRequest } from "../atlaspay/types.js";

// Retries a previously failed charge.
export async function retryCharge(pm: string) {
  const request: CreatePaymentRequest = {
    amount: 4200,
    currency: "usd",
    payment_method: pm,
  };
  return atlaspay.payments.create(request);
}
