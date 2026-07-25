import { atlaspay } from "../atlaspay/client.js";

// Charges a customer at checkout.
export async function createCheckoutPayment(amountCents: number, pmToken: string) {
  const payment = await atlaspay.payments.create({
    amount: amountCents,
    currency: "usd",
    payment_method: pmToken,
  });
  return payment;
}
