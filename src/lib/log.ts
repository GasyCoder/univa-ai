/** Records an unexpected server failure for the host's log, without request data. */
export function logFailure(scope: string, error: unknown) {
  const detail = error as { code?: string; message?: string };
  console.error(`[unuvia] ${scope} failed:`, detail?.code ?? '', detail?.message ?? String(error));
}
