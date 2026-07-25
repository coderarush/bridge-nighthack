// AtlasPay TypeScript SDK — v2 payments contract.
// BREAKING (v1 -> v2): `payment_method` was removed and replaced by the
// required `payment_method_id` on POST /payments.

export interface CreatePaymentRequest {
  amount: number;
  currency: string;
  /** v2: replaces the removed `payment_method` field. */
  payment_method_id: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
}
