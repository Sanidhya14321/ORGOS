import { clearAuthCookies } from "./auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function getApiBaseUrl(): string {
  return API_BASE;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && typeof window !== "undefined") {
    await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => undefined);
    clearAuthCookies();
    window.location.href = "/login";
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error?.code ?? "REQUEST_FAILED"
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

/** Multipart upload (do not set Content-Type; browser sets boundary). */
export async function apiUploadFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  if (response.status === 401 && typeof window !== "undefined") {
    await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => undefined);
    clearAuthCookies();
    window.location.href = "/login";
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error?.code ?? "REQUEST_FAILED"
    );
  }

  return (await response.json()) as T;
}
