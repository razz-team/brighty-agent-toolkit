import { getApiKey } from "../auth.js";

export const DEFAULT_BASE_URL = "https://api.brighty.app";

export type FetchLike = typeof fetch;

export interface ApiErrorEnvelope {
  name?: string;
  message?: string;
  description?: string;
  [key: string]: unknown;
}

export class BrightyApiError extends Error {
  override readonly name: string;
  readonly status: number;
  readonly description: string | undefined;
  readonly envelope: ApiErrorEnvelope;

  constructor(status: number, envelope: ApiErrorEnvelope, fallback: string) {
    const message =
      envelope.description ?? envelope.message ?? envelope.name ?? (fallback || `HTTP ${status}`);
    super(message);
    this.name = envelope.name ?? "BrightyApiError";
    this.status = status;
    this.description = envelope.description;
    this.envelope = envelope;
  }
}

export interface BrightyClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function resolveBaseUrl(explicit: string | undefined): string {
  // Treat empty string the same as unset — MCP clients that substitute
  // `${BRIGHTY_API_URL}` may pass through an empty value when the var is
  // unset in the parent shell, and we must fall back to the default rather
  // than throw on `new URL("")`.
  const fromEnv = process.env.BRIGHTY_API_URL?.trim();
  const raw = explicit?.trim() || (fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL);
  return raw.replace(/\/+$/, "");
}

export class BrightyClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: BrightyClientOptions) {
    if (!opts.apiKey) {
      throw new Error("BrightyClient requires a non-empty apiKey.");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = resolveBaseUrl(opts.baseUrl);
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("No fetch implementation available; pass opts.fetch on Node <18.");
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${suffix}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private buildHeaders(opts: RequestOptions, hasBody: boolean): Headers {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Accept", "application/json");
    if (hasBody) headers.set("Content-Type", "application/json");
    if (opts.idempotencyKey) headers.set("Idempotency-Key", opts.idempotencyKey);
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
    }
    return headers;
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const upperMethod = method.toUpperCase();
    const hasBody = opts.body !== undefined && upperMethod !== "GET" && upperMethod !== "HEAD";
    const url = this.buildUrl(path, opts.query);
    const headers = this.buildHeaders(opts, hasBody);

    const init: RequestInit = { method: upperMethod, headers };
    if (hasBody) init.body = JSON.stringify(opts.body);
    if (opts.signal) init.signal = opts.signal;

    const res = await this.fetchImpl(url, init);

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }

    if (!res.ok) {
      const envelope: ApiErrorEnvelope =
        parsed !== null && typeof parsed === "object" ? (parsed as ApiErrorEnvelope) : {};
      throw new BrightyApiError(res.status, envelope, text);
    }

    return parsed === undefined ? (text as unknown as T) : (parsed as T);
  }

  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  post<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  put<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, opts);
  }

  patch<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, opts);
  }

  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }
}

let cachedClient: BrightyClient | null = null;

export async function getClient(): Promise<BrightyClient> {
  if (cachedClient) return cachedClient;
  const apiKey = await getApiKey();
  cachedClient = new BrightyClient({ apiKey });
  return cachedClient;
}

export function resetClient(): void {
  cachedClient = null;
}
