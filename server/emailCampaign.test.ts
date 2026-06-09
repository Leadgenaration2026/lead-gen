import { describe, it, expect, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLeadById: vi.fn().mockResolvedValue({
      id: 1, userId: 1, companyName: 'Acme Corp', ownerName: 'John Smith',
      email: 'john@acme.com', phoneNumber: '+15551234567', industry: 'SaaS', status: 'new',
    }),
    getEmailSignature: vi.fn().mockResolvedValue({
      signatureHtml: '<p><strong>Test User</strong><br/>CEO, Test Company</p>',
      signaturePlainText: 'Test User - CEO, Test Company',
    }),
    getUserSettings: vi.fn().mockResolvedValue({
      smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUsername: 'test@gmail.com',
      smtpPassword: 'password123', senderEmail: 'test@gmail.com', senderName: 'Test User',
      retellApiKey: 'test-key', retellAgentId: 'agent-123', senderPhoneNumber: '+15559876543',
    }),
    updateLead: vi.fn().mockResolvedValue(undefined),
    upsertEmailSignature: vi.fn().mockResolvedValue(undefined),
    createCampaign: vi.fn().mockResolvedValue(99),
    addLeadsToCampaign: vi.fn().mockResolvedValue(undefined),
    getCampaignLeads: vi.fn().mockResolvedValue([{ id: 1, campaignId: 99, leadId: 1 }]),
    updateCampaignLead: vi.fn().mockResolvedValue(undefined),
    createEmailTrackingEvent: vi.fn().mockResolvedValue(undefined),
    getRotationalEmailsByUser: vi.fn().mockResolvedValue([]),
    getLeadWeakPoints: vi.fn().mockResolvedValue(null),
    getWebsiteInsights: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ subject: "quick question about acme", body: "<p>Hi John,</p><p>I noticed Acme Corp is growing fast in the SaaS space.</p><ul><li>Save time with automation</li><li>Get measurable results within 30 days</li></ul><p><a href=\"https://calendly.com/nitin-virtualassistant/30min\">Schedule a quick chat</a></p>" }) } }],
  }),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }) }) },
}));

function createTestContext(): TrpcContext {
  return {
    user: { id: 1, openId: 'test-user', name: 'Test User', email: 'test@example.com', role: 'admin' },
    req: { protocol: 'https', get: vi.fn().mockReturnValue('localhost:3000') },
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as TrpcContext;
}

describe('email.generateAI', () => {
  it('generates a personalized email for a lead', { timeout: 30000 }, async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.email.generateAI({
      leadId: 1,
      emailType: 'discovery',
    });
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('body');
    expect(typeof result.subject).toBe('string');
    expect(typeof result.body).toBe('string');
  });
});

describe('email.sendIndividual', () => {
  it('sends an individual email to a lead', async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.email.sendIndividual({
      leadId: 1, subject: 'Test Subject', body: '<p>Hello</p>',
    });
    expect(result.success).toBe(true);
    expect(result.trackingToken).toBeDefined();
  });
});
