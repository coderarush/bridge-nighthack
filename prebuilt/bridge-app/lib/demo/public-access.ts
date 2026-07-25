export type PublicDemoEnvironment = {
  DEMO_MODE?: string;
  NEXT_PUBLIC_DEMO_RUN_ID?: string;
};

export function isPublicDemoRun(
  runId: string,
  env: PublicDemoEnvironment = {
    DEMO_MODE: process.env.DEMO_MODE,
    NEXT_PUBLIC_DEMO_RUN_ID: process.env.NEXT_PUBLIC_DEMO_RUN_ID,
  },
): boolean {
  const configuredRunId = env.NEXT_PUBLIC_DEMO_RUN_ID?.trim();
  return (
    env.DEMO_MODE === "true" &&
    Boolean(configuredRunId) &&
    runId === configuredRunId
  );
}
