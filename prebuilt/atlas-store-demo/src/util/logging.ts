// This file intentionally references the *name* "payment_method" in ways that
// Bridge must NEVER rewrite: a documentation string, an unrelated identifier,
// and a string value inside a log event. None of these is an AtlasPay request key.

export const documentation = "AtlasPay previously called this payment_method";

export const payment_method_label = "Card";

export function logPaymentSelected(logger: { info: (o: unknown) => void }) {
  logger.info({ event: "payment_method_selected" });
}
