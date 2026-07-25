import { atlaspay } from "../atlaspay/client.js";

// Renews a monthly subscription.
export async function renewSubscription(subId: string, pm: string) {
  const payment = await atlaspay.payments.create({
    amount: 1999,
    currency: "usd",
    payment_method: pm,
  });
  return { subId, paymentId: payment.id };
}
