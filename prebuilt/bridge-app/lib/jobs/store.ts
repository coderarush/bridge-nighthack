import type {
  AttemptFailure,
  Job,
  JobAttempt,
  JobLease,
  JsonObject,
  RetryPolicy,
  TerminalFailure,
} from "./model";

export interface EnqueueResult {
  job: Job;
  created: boolean;
}

export interface JobTransition {
  job: Job;
  attempt: JobAttempt;
}

export interface StoreEnqueueInput {
  job: Job;
}

export interface StoreClaimInput {
  jobId: string;
  workerId: string;
  attemptId: string;
  leaseToken: string;
  now: Date;
  leaseExpiresAt: Date;
}

export interface StoreLeaseInput {
  jobId: string;
  attemptId: string;
  leaseToken: string;
  now: Date;
}

export interface StoreRenewInput extends StoreLeaseInput {
  leaseExpiresAt: Date;
}

export interface StoreSucceedInput extends StoreLeaseInput {
  resultSummary: JsonObject;
}

export type StoreFailureDisposition =
  | {
      kind: "retry";
      nextAvailableAt: Date;
    }
  | {
      kind: "terminal";
      terminalFailure: TerminalFailure;
    };

export interface StoreFailInput extends StoreLeaseInput {
  expectedAttemptNumber: number;
  expectedRetryPolicy: RetryPolicy;
  failure: AttemptFailure;
  disposition: StoreFailureDisposition;
}

/**
 * Atomic persistence port for durable orchestration state.
 *
 * Implementations must serialize transitions per job. In particular, claim must
 * close an expired active attempt before scheduling or exhausting its retry, and
 * lease-bound mutations must reject stale tokens without changing state.
 */
export interface JobStore {
  enqueue(input: StoreEnqueueInput): Promise<EnqueueResult>;
  claim(input: StoreClaimInput): Promise<JobLease | null>;
  renew(input: StoreRenewInput): Promise<JobLease>;
  succeed(input: StoreSucceedInput): Promise<JobTransition>;
  fail(input: StoreFailInput): Promise<JobTransition>;
}
