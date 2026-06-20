import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, RequestHandler } from "express";

export const LOCAL_API_TOKEN_HEADER = "X-Alice-Local-Api-Token";

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"];
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface LocalApiSecurity {
  readonly token?: string;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
}

export interface LocalApiProtectionOptions {
  readonly token?: string;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
}

export function createLocalApiToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createLocalApiSecurity(
  options: LocalApiProtectionOptions,
): LocalApiSecurity {
  return {
    token: options.token,
    allowedHosts: normalizeHosts(options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS),
    allowedOrigins: normalizeOrigins(options.allowedOrigins ?? []),
  };
}

export function createLocalApiProtectionMiddleware(
  security: LocalApiSecurity,
): RequestHandler {
  return (req, res, next) => {
    if (!shouldProtect(req)) {
      next();
      return;
    }

    if (!isAllowedHost(req.get("host"), security.allowedHosts)) {
      res.status(403).json({ error: "Forbidden host" });
      return;
    }

    if (!isAllowedOrigin(req.get("origin"), security.allowedOrigins)) {
      res.status(403).json({ error: "Forbidden origin" });
      return;
    }

    if (security.token && !hasValidToken(req.get(LOCAL_API_TOKEN_HEADER), security.token)) {
      res.status(401).json({ error: "Missing or invalid local API token" });
      return;
    }

    if (!hasJsonContentType(req)) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }

    next();
  };
}

function shouldProtect(req: Request): boolean {
  return req.path.toLowerCase().startsWith("/api/") && UNSAFE_METHODS.has(req.method);
}

function hasJsonContentType(req: Request): boolean {
  return req.is("application/json") === "application/json";
}

function hasValidToken(value: string | undefined, expected: string): boolean {
  if (!value) {
    return false;
  }

  const provided = Buffer.from(value);
  const required = Buffer.from(expected);
  return provided.length === required.length && timingSafeEqual(provided, required);
}

function isAllowedHost(value: string | undefined, allowedHosts: readonly string[]): boolean {
  const host = parseHostHeader(value);
  return host !== null && allowedHosts.includes(host);
}

function isAllowedOrigin(value: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!value) {
    return true;
  }

  if (allowedOrigins.includes(value)) {
    return true;
  }

  try {
    const origin = new URL(value);
    return DEFAULT_ALLOWED_HOSTS.includes(origin.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function parseHostHeader(value: string | undefined): string | null {
  const host = value?.split(",")[0]?.trim().toLowerCase();
  if (!host) {
    return null;
  }

  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 1 ? host.slice(1, end) : null;
  }

  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

function normalizeHosts(values: readonly string[]): readonly string[] {
  return values.map((value) => value.toLowerCase());
}

function normalizeOrigins(values: readonly string[]): readonly string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
