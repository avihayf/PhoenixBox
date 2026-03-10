export function logError(context: string, error: unknown) {
  // Keep noisy logging out of production unless explicitly needed.
  // Vite replaces import.meta.env.PROD at build time.
  if (import.meta.env && import.meta.env.PROD) return;
  // eslint-disable-next-line no-console
  console.error(context, error);
}

export function logWarn(message: string) {
  if (import.meta.env && import.meta.env.PROD) return;
  // eslint-disable-next-line no-console
  console.warn(message);
}

