import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/demo/reset/route";

const call = (secret?: string) =>
  POST(new Request("http://localhost/api/demo/reset", { method: "POST", headers: secret ? { "x-demo-reset-secret": secret } : {} }));

describe("demo reset route protection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless explicitly enabled", async () => {
    vi.stubEnv("DEMO_RESET_ENABLED", "false");
    vi.stubEnv("DEMO_RESET_SECRET", "a".repeat(32));
    expect((await call("a".repeat(32))).status).toBe(404);
  });

  it("stays disabled with a short secret", async () => {
    vi.stubEnv("DEMO_RESET_ENABLED", "true");
    vi.stubEnv("DEMO_RESET_SECRET", "short");
    expect((await call("short")).status).toBe(404);
  });

  it("rejects a missing or wrong secret", async () => {
    vi.stubEnv("DEMO_RESET_ENABLED", "true");
    vi.stubEnv("DEMO_RESET_SECRET", "a".repeat(32));
    expect((await call()).status).toBe(401);
    expect((await call("b".repeat(32))).status).toBe(401);
  });
});
