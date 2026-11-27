import type { BridgeActionPayloads } from "./types.ts";

export const DEFAULT_BRIDGE_PORT = 27129;
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

export const BRIDGE_ACTIONS = [
  "get_scene_info",
  "get_elements",
  "search_elements",
  "get_selected_elements",
  "set_view",
  "create_elements",
  "update_elements",
  "delete_elements",
  "connect_elements",
  "add_mermaid",
  "align_elements",
  "restack_elements",
  "clear_scene",
  "check_layout",
  "export_image",
] as const;

export type BridgeAction = (typeof BRIDGE_ACTIONS)[number];

export interface BridgeRequest<A extends BridgeAction = BridgeAction> {
  action: A;
  params: BridgeActionPayloads[A]["input"];
  requestId?: string;
}

export type BridgeResponse<T = unknown> =
  | {
      ok: true;
      data: T;
      requestId?: string;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
      requestId?: string;
    };

export type PathValidationResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

const URI_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/;

/**
 * Validates that a string is a safe, relative vault path.
 * Rejects empty paths, null bytes, backslashes, Windows drive letters,
 * URI schemes, leading slashes, and `.` / `..` traversal segments.
 */
export function validateVaultRelativePath(p: string): PathValidationResult {
  if (typeof p !== "string") {
    return { ok: false, error: "Path must be a string" };
  }

  if (p.includes("\0")) {
    return { ok: false, error: "Path contains null byte" };
  }

  const trimmed = p.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Path must not be empty" };
  }

  if (trimmed !== p) {
    return { ok: false, error: "Path must not have leading or trailing whitespace" };
  }

  if (URI_SCHEME_PATTERN.test(p)) {
    return { ok: false, error: "URI schemes are not allowed in vault paths" };
  }

  if (p.includes("\\")) {
    return { ok: false, error: "Backslashes are not allowed in vault paths" };
  }

  if (WINDOWS_DRIVE_PATTERN.test(p)) {
    return { ok: false, error: "Windows drive letters are not allowed in vault paths" };
  }

  if (p.startsWith("/")) {
    return { ok: false, error: "Leading '/' is not allowed; path must be vault-relative" };
  }

  const segments = p.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, error: "Empty path segments ('//') or trailing '/' are not allowed" };
    }
    if (segment === "." || segment === "..") {
      return { ok: false, error: `Path segment '${segment}' is not allowed` };
    }
  }

  return { ok: true, path: p };
}
