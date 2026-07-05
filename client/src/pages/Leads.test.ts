import { describe, it, expect } from 'vitest';

describe('Leads Page - Phone Filter', () => {
  it('should filter leads with both email and phone', () => {
    const leads = [
      { id: 1, email: 'john@acme.com', phoneNumber: '+1-555-0001', companyName: 'Acme' },
      { id: 2, email: 'jane@tech.io', phoneNumber: '', companyName: 'Tech Inc' },
      { id: 3, email: '', phoneNumber: '+1-555-0003', companyName: 'Global' },
      { id: 4, email: 'bob@startup.co', phoneNumber: '+1-555-0004', companyName: 'Startup' },
    ];

    // Filter for "has-phone" - both email AND phone
    const hasPhoneFilter = leads.filter(lead => {
      const hasPhone = lead.phoneNumber && lead.phoneNumber.trim().length > 0;
      const hasEmail = lead.email && lead.email.trim().length > 0;
      return hasPhone && hasEmail;
    });

    expect(hasPhoneFilter).toHaveLength(2);
    expect(hasPhoneFilter[0].id).toBe(1);
    expect(hasPhoneFilter[1].id).toBe(4);
  });

  it('should filter leads missing email or phone', () => {
    const leads = [
      { id: 1, email: 'john@acme.com', phoneNumber: '+1-555-0001', companyName: 'Acme' },
      { id: 2, email: 'jane@tech.io', phoneNumber: '', companyName: 'Tech Inc' },
      { id: 3, email: '', phoneNumber: '+1-555-0003', companyName: 'Global' },
      { id: 4, email: 'bob@startup.co', phoneNumber: '+1-555-0004', companyName: 'Startup' },
    ];

    // Filter for "no-phone" - missing either email or phone
    const noPhoneFilter = leads.filter(lead => {
      const hasPhone = lead.phoneNumber && lead.phoneNumber.trim().length > 0;
      const hasEmail = lead.email && lead.email.trim().length > 0;
      return !hasPhone || !hasEmail;
    });

    expect(noPhoneFilter).toHaveLength(2);
    expect(noPhoneFilter[0].id).toBe(2);
    expect(noPhoneFilter[1].id).toBe(3);
  });

  it('should show all leads when filter is "all"', () => {
    const leads = [
      { id: 1, email: 'john@acme.com', phoneNumber: '+1-555-0001', companyName: 'Acme' },
      { id: 2, email: 'jane@tech.io', phoneNumber: '', companyName: 'Tech Inc' },
      { id: 3, email: '', phoneNumber: '+1-555-0003', companyName: 'Global' },
    ];

    // Filter for "all" - no filtering
    const allFilter = leads.filter(() => true);

    expect(allFilter).toHaveLength(3);
  });

  it('should handle empty phone and email fields', () => {
    const leads = [
      { id: 1, email: '', phoneNumber: '', companyName: 'Empty' },
      { id: 2, email: null, phoneNumber: null, companyName: 'Null' },
      { id: 3, email: '   ', phoneNumber: '   ', companyName: 'Whitespace' },
    ];

    // Filter for "has-phone" - should exclude all
    const hasPhoneFilter = leads.filter(lead => {
      const hasPhone = lead.phoneNumber && lead.phoneNumber.trim().length > 0;
      const hasEmail = lead.email && lead.email.trim().length > 0;
      return hasPhone && hasEmail;
    });

    expect(hasPhoneFilter).toHaveLength(0);
  });

  it('should correctly identify leads with phone numbers', () => {
    const testCases = [
      { phone: '+1-555-0001', expected: true },
      { phone: '(555) 123-4567', expected: true },
      { phone: '+44-20-1234-5678', expected: true },
      { phone: '', expected: false },
      { phone: '   ', expected: false },
      { phone: null, expected: false },
      { phone: undefined, expected: false },
    ];

    testCases.forEach(({ phone, expected }) => {
      const hasPhone = phone && phone.trim().length > 0;
      expect(hasPhone).toBe(expected);
    });
  });
});
