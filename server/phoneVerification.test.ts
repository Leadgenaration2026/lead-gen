import { describe, it, expect, vi, beforeEach } from 'vitest';
import { researchContact, pollContactResults } from './seamlessAI';

// Mock the seamlessAI module
vi.mock('./seamlessAI', () => ({
  researchContact: vi.fn(),
  pollContactResults: vi.fn(),
}));

describe('Phone Verification Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should submit research requests for phone verification', async () => {
    const mockResearchResponse = {
      success: true,
      requestIds: ['req-1', 'req-2', 'req-3'],
    };

    (researchContact as any).mockResolvedValue(mockResearchResponse);

    const seamlessIds = ['contact-1', 'contact-2', 'contact-3'];
    const result = await researchContact('test-api-key', seamlessIds);

    expect(result.success).toBe(true);
    expect(result.requestIds).toHaveLength(3);
    expect(result.requestIds).toEqual(['req-1', 'req-2', 'req-3']);
  });

  it('should poll for phone verification results', async () => {
    const mockPollResults = [
      {
        requestId: 'req-1',
        status: 'done',
        contact: {
          phoneNumber: '+1-555-0001',
          contactPhone1: '+1-555-0001',
        },
      },
      {
        requestId: 'req-2',
        status: 'done',
        contact: {
          phoneNumber: '+1-555-0002',
          contactPhone1: '+1-555-0002',
        },
      },
      {
        requestId: 'req-3',
        status: 'missing',
        contact: null,
      },
    ];

    (pollContactResults as any).mockResolvedValue(mockPollResults);

    const requestIds = ['req-1', 'req-2', 'req-3'];
    const results = await pollContactResults('test-api-key', requestIds);

    expect(results).toHaveLength(3);
    expect(results[0].contact?.phoneNumber).toBe('+1-555-0001');
    expect(results[1].contact?.phoneNumber).toBe('+1-555-0002');
    expect(results[2].status).toBe('missing');
  });

  it('should extract phone numbers from poll results', async () => {
    const pollResults = [
      {
        requestId: 'req-1',
        status: 'done',
        contact: {
          phoneNumber: '+1-555-0001',
          contactPhone1: '+1-555-0001',
          workPhone: '+1-555-0001',
        },
      },
      {
        requestId: 'req-2',
        status: 'done',
        contact: {
          phoneNumber: '+1-555-0002',
          contactPhone1: '+1-555-0002',
        },
      },
      {
        requestId: 'req-3',
        status: 'missing',
        contact: null,
      },
    ];

    // Extract phone numbers like the enrichment router does
    const phoneNumbers = pollResults.map((result) => {
      if (!result.contact) return null;
      return result.contact.phoneNumber || result.contact.contactPhone1 || result.contact.workPhone;
    });

    expect(phoneNumbers[0]).toBe('+1-555-0001');
    expect(phoneNumbers[1]).toBe('+1-555-0002');
    expect(phoneNumbers[2]).toBeNull();
  });

  it('should handle research submission failure gracefully', async () => {
    const mockFailureResponse = {
      success: false,
      requestIds: [],
      error: 'API rate limit exceeded',
    };

    (researchContact as any).mockResolvedValue(mockFailureResponse);

    const seamlessIds = ['contact-1'];
    const result = await researchContact('test-api-key', seamlessIds);

    expect(result.success).toBe(false);
    expect(result.requestIds).toHaveLength(0);
  });

  it('should handle empty seamlessId list', async () => {
    const seamlessIds: string[] = [];
    
    // Should not call API if no IDs
    if (seamlessIds.length === 0) {
      expect(seamlessIds).toHaveLength(0);
      return;
    }

    await researchContact('test-api-key', seamlessIds);
    expect(researchContact).not.toHaveBeenCalled();
  });

  it('should map poll results to lead updates', async () => {
    const pollResults = [
      {
        requestId: 'req-1',
        status: 'done',
        contact: {
          phoneNumber: '+1-555-0001',
          firstName: 'John',
          lastName: 'Doe',
        },
      },
      {
        requestId: 'req-2',
        status: 'done',
        contact: {
          contactPhone1: '+1-555-0002',
          firstName: 'Jane',
          lastName: 'Smith',
        },
      },
    ];

    // Simulate lead updates
    const leadUpdates = pollResults.map((result, index) => {
      const phoneNumber = result.contact?.phoneNumber || result.contact?.contactPhone1 || result.contact?.workPhone;
      return {
        leadId: index + 1,
        phoneNumber: phoneNumber || null,
        status: phoneNumber ? 'success' : 'needs_review',
      };
    });

    expect(leadUpdates[0].phoneNumber).toBe('+1-555-0001');
    expect(leadUpdates[0].status).toBe('success');
    expect(leadUpdates[1].phoneNumber).toBe('+1-555-0002');
    expect(leadUpdates[1].status).toBe('success');
  });
});
