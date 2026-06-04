import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: { host: "localhost:3000" },
      get: (name: string) => {
        if (name === 'host') return 'localhost:3000';
        return undefined;
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

// Mock db module
vi.mock("./db", () => ({
  getLeadById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    companyName: "Acme Corp",
    ownerName: "John Smith",
    email: "john@acme.com",
    phoneNumber: "+15551234567",
    industry: "SaaS",
    status: "new",
  }),
  getEmailSignature: vi.fn().mockResolvedValue({
    signatureHtml: "<p><strong>Test User</strong><br/>CEO, Test Company</p>",
    signaturePlainText: "Test User\nCEO, Test Company",
  }),
  getUserSettings: vi.fn().mockResolvedValue({
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpUsername: "test@gmail.com",
    smtpPassword: "password123",
    senderEmail: "test@gmail.com",
    senderName: "Test User",
    retellApiKey: "test-key",
    retellAgentId: "agent-123",
    senderPhoneNumber: "+15559876543",
  }),
  updateLead: vi.fn().mockResolvedValue(undefined),
  upsertEmailSignature: vi.fn().mockResolvedValue(undefined),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          subject: "quick question about acme",
          body: "<p>Hi John,</p><p>I noticed Acme Corp is growing fast in the SaaS space.</p><ul><li>Benefit 1</li><li>Benefit 2</li></ul><p>Schedule a quick chat: https://calendly.com/nitin-virtualassistant/30min</p>",
        }),
      },
    }],
  }),
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-msg-id" }),
    }),
  },
}));

describe("email.generateAI", () => {
  it("generates an AI-powered email with subject and body", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.email.generateAI({
      leadId: 1,
      emailType: "discovery",
      instructions: "Ask about their growth challenges",
      ctaLink: "https://calendly.com/nitin-virtualassistant/30min",
    });

    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("body");
    expect(result).toHaveProperty("bodyWithoutSignature");
    expect(result.subject).toBe("quick question about acme");
    expect(result.body).toContain("Hi John");
    expect(result.body).toContain("Test User"); // Signature appended
    expect(result.body).toContain("CEO, Test Company"); // Signature content
  });

  it("generates email for different email types", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const types = ["discovery", "value_prop", "social_proof", "urgency", "custom"] as const;
    for (const emailType of types) {
      const result = await caller.email.generateAI({
        leadId: 1,
        emailType,
      });
      expect(result.subject).toBeTruthy();
      expect(result.body).toBeTruthy();
    }
  });
});

describe("email.sendIndividual", () => {
  it("sends an individual email to a lead", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.email.sendIndividual({
      leadId: 1,
      subject: "Quick question about Acme",
      body: "<p>Hi John, I noticed your company...</p>",
    });

    expect(result).toEqual({ success: true, trackingToken: expect.any(String) });
  });
});

describe("signature.update", () => {
  it("saves an email signature", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.signature.update({
      signatureHtml: "<p><strong>Nitin</strong><br/>CEO, Virtual Assistant Pro</p>",
      signaturePlainText: "Nitin\nCEO, Virtual Assistant Pro",
    });

    expect(result).toEqual({ success: true });
  });
});
