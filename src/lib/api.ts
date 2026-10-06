/**
 * Cross-platform API URL resolver.
 * - On Web: Defaults to relative paths (e.g., '/api/ai') for same-origin serverless functions.
 * - On Mobile (Capacitor/APK): Resolves against VITE_API_URL or VITE_BACKEND_URL if provided,
 *   enabling the APK to connect seamlessly to cloud serverless endpoints.
 */
export function getApiBaseUrl(): string {
  const configured = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    ''
  ).trim().replace(/\/$/, '')

  return configured
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl()
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return base ? `${base}${path}` : path
}
