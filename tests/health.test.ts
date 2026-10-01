import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("app liveness", () => {
  it("responds without credentials and makes no downstream readiness claim", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok", service: "kirana-shop-ai", scope: "app-only",
    });
  });
});
