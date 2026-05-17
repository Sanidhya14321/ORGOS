import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");

// Next.js only auto-loads env from apps/web; ORGOS keeps secrets at repo root (same as API).
dotenv.config({ path: path.join(monorepoRoot, ".env") });
dotenv.config({ path: path.join(monorepoRoot, ".env.local"), override: true });

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

const publicSupabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL") || readEnv("SUPABASE_URL");
const publicSupabaseAnon = readEnv("NEXT_PUBLIC_SUPABASE_ANON") || readEnv("SUPABASE_ANON_KEY");
const publicApiUrl = readEnv("NEXT_PUBLIC_API_URL") || readEnv("NEXT_PUBLIC_API_BASE_URL");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ...(publicSupabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl } : {}),
    ...(publicSupabaseAnon ? { NEXT_PUBLIC_SUPABASE_ANON: publicSupabaseAnon } : {}),
    ...(publicApiUrl ? { NEXT_PUBLIC_API_URL: publicApiUrl } : {})
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const scriptSrc = isProduction
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";
    const connectSrc = isProduction
      ? "connect-src 'self' ws: wss: https:"
      : "connect-src 'self' ws: wss: https: http://localhost:3000 http://localhost:4000";

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; ${connectSrc}; img-src 'self' data: https:`
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
