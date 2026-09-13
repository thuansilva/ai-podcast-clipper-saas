import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "~/app/api/webhooks/clerk/route";
import { makeSyncUserUseCase } from "~/infrastructure/factories/use-case-factories";
import { db } from "~/server/db";

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeSyncUserUseCase: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    user: {
      delete: vi.fn(),
    },
  },
}));

// Mock svix Webhook class
vi.mock("svix", () => {
  return {
    Webhook: class MockWebhook {
      verify(payload: string) {
        return JSON.parse(payload);
      }
    },
  };
});

describe("Clerk Webhook API Route", () => {
  const mockSyncExecute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeSyncUserUseCase).mockReturnValue({
      execute: mockSyncExecute,
    } as any);
  });

  it("deve retornar 400 se os cabeçalhos do svix estiverem ausentes", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing Svix headers");
  });

  it("deve processar evento user.created e chamar SyncUserUseCase", async () => {
    const payload = {
      type: "user.created",
      data: {
        id: "user_clerk_create_123",
        email_addresses: [{ email_address: "novo@clerk.com" }],
        first_name: "Novo",
        last_name: "Usuario",
        image_url: "https://avatar.png",
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      headers: {
        "svix-id": "msg_test_123",
        "svix-timestamp": "1234567890",
        "svix-signature": "v1,signature",
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSyncExecute).toHaveBeenCalledWith({
      clerkUserId: "user_clerk_create_123",
      email: "novo@clerk.com",
      name: "Novo Usuario",
      image: "https://avatar.png",
    });
  });

  it("deve processar evento user.deleted e excluir usuário do banco", async () => {
    const payload = {
      type: "user.deleted",
      data: {
        id: "user_clerk_delete_456",
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      headers: {
        "svix-id": "msg_test_456",
        "svix-timestamp": "1234567890",
        "svix-signature": "v1,signature",
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(db.user.delete).toHaveBeenCalledWith({
      where: { id: "user_clerk_delete_456" },
    });
  });
});
