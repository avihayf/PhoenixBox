// Errors are logged in every build: silencing them in production meant a
// failed save, delete or proxy toggle left nothing in the popup console to
// diagnose. Warnings stay development-only.
export function logError(context: string, error: unknown) {
  console.error(context, error);
}

export function logWarn(message: string) {
  // Vite replaces import.meta.env.PROD at build time.
  if (import.meta.env && import.meta.env.PROD) return;
  console.warn(message);
}

