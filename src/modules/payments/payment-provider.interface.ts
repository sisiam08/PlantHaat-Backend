export interface CreatePaymentInput {
  orderId: string;
  amount: string;
  currency: string;
  description?: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntent {
  provider: string;
  providerTxnId: string;
  status: "PENDING" | "PAID" | "FAILED";
  redirectUrl?: string;
  raw?: unknown;
}

export interface PaymentCallbackResult {
  providerTxnId: string;
  status: "PAID" | "FAILED";
  amount?: string;
  raw?: unknown;
}

export interface RefundInput {
  providerTxnId: string;
  amount: string;
  reason?: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  raw?: unknown;
}

/**
 * Payment gateway abstraction. v1 ships COD only; the online adapters
 * (PipaPay, bKash, ...) will implement this interface once their
 * documentation is provided. Do not assume any gateway capability.
 */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  verifyCallback(payload: unknown, headers: Record<string, string>): Promise<PaymentCallbackResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
