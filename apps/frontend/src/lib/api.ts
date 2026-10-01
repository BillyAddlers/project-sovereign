import axios, { type AxiosError, type AxiosInstance } from "axios";

import { env } from "@/lib/env";

/** Error envelope returned by the backend for every non-2xx response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Normalised error thrown by our request helpers, safe to surface in the UI. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody | undefined, fallback: string) {
    super(body?.error?.message ?? fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "UNKNOWN";
    this.details = body?.error?.details;
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: `${env.apiBaseUrl}/api`,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Attach credentials so the backend can later move auth to httpOnly cookies.
http.defaults.withCredentials = true;

// Unwrap the backend error envelope once, centrally.
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response) {
      return Promise.reject(
        new ApiError(
          error.response.status,
          error.response.data,
          error.response.statusText || "Request failed",
        ),
      );
    }
    if (error.code === "ECONNABORTED") {
      return Promise.reject(new ApiError(0, undefined, "The request timed out."));
    }
    return Promise.reject(
      new ApiError(0, undefined, "Cannot reach the server. Is the backend running?"),
    );
  },
);

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.get<T>(url, { params });
  return data;
}

export async function post<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
): Promise<TResponse> {
  const { data } = await http.post<TResponse>(url, body);
  return data;
}
