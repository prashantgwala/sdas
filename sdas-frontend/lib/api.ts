import type { ApiErrorBody, ApiMeta } from "./types";

const API_BASE = "/api/v1";
const CSRF_COOKIE = "sdas_csrf";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface ListResult<T> {
  items: T[];
  meta?: ApiMeta;
}

type RequestInitWithBody = Omit<RequestInit, "body"> & {
  body?: unknown;
  skipRefresh?: boolean;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function execute<T>(path: string, init: RequestInitWithBody): Promise<{ data: T; meta?: ApiMeta }> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body:
      init.body === undefined
        ? undefined
        : init.body instanceof FormData
          ? init.body
          : JSON.stringify(init.body),
  });

  const payload = (await parseBody(response)) as
    | { success: true; data: T; meta?: ApiMeta }
    | ApiErrorBody
    | null;

  if (response.status === 401 && !init.skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return execute<T>(path, { ...init, skipRefresh: true });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sdas:session-expired"));
    }
  }

  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload) {
      const error = (payload as ApiErrorBody).error;
      throw new ApiError(
        response.status,
        error.code,
        error.message,
        error.details,
        (payload as ApiErrorBody).requestId,
      );
    }
    throw new ApiError(response.status, "REQUEST_FAILED", `Request failed with status ${response.status}`);
  }

  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new ApiError(response.status, "INVALID_RESPONSE", "The server returned an unexpected response");
  }

  return { data: payload.data as T, meta: payload.meta };
}

export const api = {
  async get<T>(path: string, init?: Omit<RequestInitWithBody, "method" | "body">): Promise<T> {
    const { data } = await execute<T>(path, { ...init, method: "GET" });
    return data;
  },

  async list<T>(
    path: string,
    init?: Omit<RequestInitWithBody, "method" | "body">,
  ): Promise<ListResult<T>> {
    const { data, meta } = await execute<T[]>(path, { ...init, method: "GET" });
    return { items: Array.isArray(data) ? data : [], meta };
  },

  async post<T>(path: string, body?: unknown, init?: Omit<RequestInitWithBody, "method">): Promise<T> {
    const { data } = await execute<T>(path, { ...init, method: "POST", body });
    return data;
  },

  async patch<T>(path: string, body?: unknown, init?: Omit<RequestInitWithBody, "method">): Promise<T> {
    const { data } = await execute<T>(path, { ...init, method: "PATCH", body });
    return data;
  },

  async put<T>(path: string, body?: unknown, init?: Omit<RequestInitWithBody, "method">): Promise<T> {
    const { data } = await execute<T>(path, { ...init, method: "PUT", body });
    return data;
  },

  async delete<T>(path: string, init?: Omit<RequestInitWithBody, "method" | "body">): Promise<T> {
    const { data } = await execute<T>(path, { ...init, method: "DELETE" });
    return data;
  },

  async upload<T>(path: string, form: FormData, method: "POST" | "PATCH" = "POST"): Promise<T> {
    const { data } = await execute<T>(path, { method, body: form });
    return data;
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
