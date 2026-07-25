type WaitForPullRequestHeadOptions = {
  expectedSha: string;
  readHead: () => Promise<string>;
  attempts?: number;
  wait?: () => Promise<void>;
};

export class PullRequestHeadMismatchError extends Error {
  constructor(
    readonly observedSha: string,
    readonly expectedSha: string,
  ) {
    super(
      `Draft PR head ${observedSha || "missing"} does not match committed SHA ${expectedSha}.`,
    );
    this.name = "PullRequestHeadMismatchError";
  }
}

const defaultWait = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 650);
  });

export async function waitForExpectedPullRequestHead({
  expectedSha,
  readHead,
  attempts = 6,
  wait = defaultWait,
}: WaitForPullRequestHeadOptions): Promise<string> {
  let observedSha = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    observedSha = await readHead();
    if (observedSha === expectedSha) return observedSha;
    if (attempt < attempts - 1) await wait();
  }

  throw new PullRequestHeadMismatchError(observedSha, expectedSha);
}

export async function assertExpectedPullRequestHead({
  expectedSha,
  readHead,
}: Pick<
  WaitForPullRequestHeadOptions,
  "expectedSha" | "readHead"
>): Promise<string> {
  const observedSha = await readHead();
  if (observedSha !== expectedSha) {
    throw new PullRequestHeadMismatchError(observedSha, expectedSha);
  }
  return observedSha;
}
