/** Shared helpers for route handlers: JSON validation and consistent error responses. */
import { z } from "zod";
import { DomainError } from "@/lib/bills";

const headers = { "Cache-Control": "no-store" };
const STATUS = { NOT_FOUND: 404, INVALID: 422, CONFLICT: 409 } as const;

export const uuid = z.uuid();

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new DomainError("INVALID", "Request body must be JSON."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DomainError("INVALID", parsed.error.issues[0]?.message ?? "Invalid request.");
  return parsed.data;
}

export function parseId(value: string): string {
  if (!uuid.safeParse(value).success) throw new DomainError("NOT_FOUND", "Not found.");
  return value;
}

/** Wrap a handler so domain errors become 4xx JSON and everything else a logged 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message, code: error.code }, { status: STATUS[error.code], headers });
    console.error(error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500, headers });
  }
}
