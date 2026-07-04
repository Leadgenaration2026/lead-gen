# Production Test Runner - Seamless.AI Enrichment

This document provides a step-by-step guide to run all 10 production validation tests. Each test is designed to verify a specific aspect of the enrichment feature.

## Quick Start

1. Open your application in production
2. Navigate to the Leads page
3. Follow each test scenario below
4. Document results in the checklist at the end

---

## Test 1: Single Lead Enrichment (Baseline)

**Duration**: 5-10 seconds  
**Credits Expected**: 1

### Setup
1. Create or select a single test lead:
   - Name: John Smith
   - Company: TechCorp Inc
   - Job Title: Owner
   - Email: john@techcorp.com

### Execution
1. Select the lead in the leads table
2. Click "Enrich Selected Leads" button
3. Wait for enrichment to complete

### Verification
- [ ] Lead updates with phone number (if found)
- [ ] Lead updates with expanded job title
- [ ] Lead updates with company size
- [ ] UI shows success message
- [ ] Console shows: "Research IDs Submitted: 1"
- [ ] Console shows: "Expected Credits: 1"
- [ ] Exactly 1 credit consumed

### Result: _____ (PASS/FAIL)

---

## Test 2: Double-Click Protection

**Duration**: 2-5 seconds  
**Credits Expected**: 1 (not 2)

### Setup
1. Create or select a test lead:
   - Name: Jane Doe
   - Company: StartupXYZ
   - Job Title: CEO

### Execution
1. Select the lead
2. Click "Enrich Selected Leads"
3. **Immediately click again** (within 1-2 seconds)

### Verification
- [ ] First request processes normally
- [ ] Second click shows error: "409 Conflict" or "Duplicate request"
- [ ] Console shows: "Duplicate request detected"
- [ ] Only 1 credit consumed total
- [ ] Lead data updated only once

### Result: _____ (PASS/FAIL)

---

## Test 3: Five Leads Enrichment

**Duration**: 10-15 seconds  
**Credits Expected**: 5

### Setup
1. Create 5 test leads with different titles:
   - Lead 1: Sales Director
   - Lead 2: Marketing Manager
   - Lead 3: Operations Manager
   - Lead 4: Finance Director
   - Lead 5: IT Manager

### Execution
1. Select all 5 leads (use "Select All" checkbox)
2. Click "Enrich Selected Leads"
3. Wait for completion

### Verification
- [ ] All 5 leads update with enriched data
- [ ] Console shows: "Research IDs Submitted: 5"
- [ ] Console shows: "Expected Credits: 5"
- [ ] Approximately 5 credits consumed
- [ ] Success count: 4-5 (some may fail if not found)

### Result: _____ (PASS/FAIL)

---

## Test 4: Twenty Leads Enrichment

**Duration**: 15-20 seconds  
**Credits Expected**: 20

### Setup
1. Create 20 test leads (or use existing leads)
2. Ensure variety of job titles and companies

### Execution
1. Select all 20 leads
2. Click "Enrich Selected Leads"
3. Confirm dialog if shown: "This will consume approximately 20 credits. Continue?"
4. Wait for completion

### Verification
- [ ] Confirmation dialog shown
- [ ] All 20 leads process
- [ ] Console shows: "Research IDs Submitted: 20"
- [ ] Console shows: "Expected Credits: 20"
- [ ] Approximately 20 credits consumed
- [ ] Success count: 15-20

### Result: _____ (PASS/FAIL)

---

## Test 5: Over-Limit Rejection (Hard Guard)

**Duration**: < 1 second  
**Credits Expected**: 0

### Setup
1. Prepare 1500+ leads (or attempt to select more than hard limit)

### Execution
1. Try to select 1500+ leads
2. Click "Enrich Selected Leads"

### Verification
- [ ] Error message shown: "Cannot enrich more than 1000 leads"
- [ ] No API calls made
- [ ] No credits consumed
- [ ] No enrichment job created

### Result: _____ (PASS/FAIL)

---

## Test 6: Job Title Expansion Verification

**Duration**: 10 seconds  
**Credits Expected**: 1

### Setup
1. Create a test lead:
   - Name: Bob Johnson
   - Company: Small Business Inc
   - Job Title: Owner

### Execution
1. Select the lead
2. Click "Enrich Selected Leads"
3. Check browser console (F12 → Console tab)

### Verification
- [ ] Console shows expanded titles: ["Owner", "Founder", "CEO", "President", ...]
- [ ] Lead enriched successfully
- [ ] Confidence score reasonable (>70%)
- [ ] Console shows: "Expanded job titles: [...]"

### Result: _____ (PASS/FAIL)

---

## Test 7: Audit Logging Verification

**Duration**: 5 minutes (includes database check)  
**Credits Expected**: Variable (from previous tests)

### Setup
1. Complete Tests 1-3 (or any enrichment tests)

### Execution
1. Open database client or admin panel
2. Query enrichmentJobs table:
   ```sql
   SELECT * FROM enrichmentJobs 
   WHERE userId = 'YOUR_USER_ID' 
   ORDER BY createdAt DESC 
   LIMIT 5;
   ```

### Verification
- [ ] Each enrichment run has a record
- [ ] jobId field is populated (unique hash)
- [ ] selectedLeadCount matches number of leads
- [ ] researchRequestCount matches leads processed
- [ ] creditsExpected field shows correct count
- [ ] status is "completed" or "failed"
- [ ] Timestamps are accurate

### Result: _____ (PASS/FAIL)

---

## Test 8: Error Handling & Recovery

**Duration**: 15 seconds  
**Credits Expected**: 0 (first attempt), then 1 (after fix)

### Setup
1. Create a test lead

### Execution - Part A (Error)
1. Temporarily disable Seamless.AI API key (set to invalid)
2. Try to enrich the lead
3. Observe error handling

### Verification - Part A
- [ ] Error message shown: "API authentication error"
- [ ] No credits consumed
- [ ] Lead marked as "needs_review" (optional)
- [ ] Console shows detailed error

### Execution - Part B (Recovery)
1. Restore correct API key
2. Retry enrichment

### Verification - Part B
- [ ] Enrichment succeeds
- [ ] Lead updates normally
- [ ] 1 credit consumed

### Result: _____ (PASS/FAIL)

---

## Test 9: Network Interruption Recovery

**Duration**: 30 seconds  
**Credits Expected**: 1

### Setup
1. Create a test lead

### Execution
1. Start enrichment
2. During enrichment (within 5 seconds), simulate network failure:
   - Disconnect internet, OR
   - Use browser DevTools: Network tab → Throttle to "Offline"
3. Wait 10 seconds
4. Restore network
5. Retry enrichment

### Verification - Part A (Failure)
- [ ] Request times out or fails
- [ ] Lead NOT updated
- [ ] Error message shown

### Verification - Part B (Recovery)
- [ ] Retry uses same Job ID
- [ ] Idempotency check recognizes retry
- [ ] Enrichment completes successfully
- [ ] Only 1 credit consumed total
- [ ] Lead updated only once

### Result: _____ (PASS/FAIL)

---

## Test 10: Confidence Scoring & Needs Review

**Duration**: 10 seconds  
**Credits Expected**: 1

### Setup
1. Create an ambiguous test lead:
   - Name: John Smith (very common)
   - Company: Tech Inc (generic)
   - Job Title: Manager
   - No email or location

### Execution
1. Select the lead
2. Click "Enrich Selected Leads"
3. Check database after completion

### Verification
- [ ] Enrichment completes
- [ ] Check enrichmentJobs table for confidence score
- [ ] If confidence < 80:
  - [ ] Lead marked as "needs_review"
  - [ ] Console shows: "Confidence score too low"
- [ ] If confidence >= 80:
  - [ ] Lead updated normally
  - [ ] Status is "completed"

### Result: _____ (PASS/FAIL)

---

## Final Checklist

Mark each test as PASS or FAIL:

| Test | Result | Notes |
|------|--------|-------|
| 1. Single Lead | [ ] | |
| 2. Double-Click | [ ] | |
| 3. Five Leads | [ ] | |
| 4. Twenty Leads | [ ] | |
| 5. Over-Limit | [ ] | |
| 6. Title Expansion | [ ] | |
| 7. Audit Logging | [ ] | |
| 8. Error Handling | [ ] | |
| 9. Network Recovery | [ ] | |
| 10. Confidence Score | [ ] | |

**Total Passed**: _____ / 10

---

## Troubleshooting

### Issue: "Insufficient credits" error
- Check Seamless.AI account balance
- Purchase more credits if needed
- Verify API key is current

### Issue: "API authentication error"
- Verify API key in Settings is correct
- Check that API key hasn't expired
- Regenerate API key in Seamless.AI dashboard

### Issue: Enrichment taking > 30 seconds
- Check internet connection
- Verify Seamless.AI API status
- Try with fewer leads first

### Issue: Leads not updating
- Check browser console for errors (F12)
- Verify database connection
- Restart application if needed

---

## Success Criteria

✅ **Production Ready** when:
- All 10 tests show PASS
- No unexpected errors
- Credit consumption matches expectations
- Audit logs complete and accurate

⚠️ **Needs Investigation** if:
- Any test shows FAIL
- Credits consumed differ from expected
- Audit logs incomplete or missing

---

## Next Steps

Once all tests pass:

1. **Deploy to production** using the Publish button
2. **Monitor for 1 week** - check audit logs daily
3. **Collect user feedback** on enrichment quality
4. **Adjust settings** if needed (confidence threshold, credit limits)
5. **Consider expansion** to other data providers

---

## Support

For issues:
1. Check `.manus-logs/devserver.log` for detailed errors
2. Review `enrichmentJobs` table for audit trail
3. Contact Seamless.AI support: https://support.seamless.ai
