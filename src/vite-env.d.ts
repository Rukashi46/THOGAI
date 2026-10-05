/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly SUPABASE_URL?: string
  readonly SUPABASE_ANON_KEY?: string
  readonly GEMINI_API_KEY?: string
  readonly GEMINI_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
