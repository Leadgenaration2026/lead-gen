# Production Validation Guide - Seamless.AI Enrichment Feature

## Overview

This guide walks you through validating the Seamless.AI enrichment feature in your production environment. The feature includes:

- **Job Title Expansion Map**: Automatically expands job titles to find more matches (e.g., "Owner" → ["CEO", "Founder", "President", ...])
- **Credit Protection**: Hard guards prevent accidental over-consumption of API credits
- **Idempotency**: Double-click protection prevents duplicate charges
- **Audit Logging**: Every enrichment run is logged for accountability

## Prerequisites

1. Production database running and connected
2. Seamless.AI API key configured in Settings
3. At least one lead in the database
4. Dev server running: `pnpm run dev`

## Test 1: Single Lead Enrichment (Baseline)

**Objective**: Verify that enriching 1 lead consumes exactly 1 credit and updates the database.

### Steps:

1. **Create a test lead** in the database or UI:
   - Name: John Smith
   - Company: TechCorp Inc
   - Job Title: Owner
   - Email: john@techcorp.com
   - City: San Francisco
   - State: CA
   - Country: United States

2. **Navigate to Leads page** and select the test lead

3. **Click "Enrich Selected Leads"** button

4. **Expected Results**:
   - UI shows loading state
   - After 5-10 seconds, lead updates with:
     - Phone number (if found)
     - Job title (expanded from "Owner")
     - Company size
     - Email (if different from input)
   - Console logs show:
     ```
     [Seamless.AI] Search request: 1 lead
     [Seamless.AI] Research IDs Submitted: 1
     [Seamless.AI] Expected Credits: 1
     [Seamless.AI] Enrichment completed: 1 successful, 0 failed
     ```

5. **Verify database**:
   - Check `leads` table for updated fields
   - Check `enrichmentJobs` table for job record with status="completed"

### Success Criteria:
- ✅ Exactly 1 Search API call
- ✅ Exactly 1 Research API call (1 credit consumed)
- ✅ Database updated with enriched data
- ✅ No duplicate API calls
- ✅ Job ID in response

---

## Test 2: Double-Click Protection (Idempotency)

**Objective**: Verify that clicking the button twice doesn't charge twice.

### Steps:

1. **Create another test lead** (or use previous one):
   - Name: Jane Doe
   - Company: StartupXYZ
   - Job Title: CEO

2. **Select the lead** and click "Enrich Selected Leads"

3. **Immediately click again** (within 2 seconds) before the first request completes

4. **Expected Results**:
   - First request processes normally
   - Second request returns **409 Conflict** error
   - Console shows:
     ```
     [Seamless.AI] Duplicate request detected (Job ID: xxx)
     ```
   - Only 1 credit consumed total

5. **Verify database**:
   - Only 1 enrichment job record created
   - Lead data updated only once

### Success Criteria:
- ✅ Second click rejected with 409 error
- ✅ Only 1 credit consumed
- ✅ No duplicate data in database
- ✅ User sees error message in UI

---

## Test 3: Five Leads Enrichment

**Objective**: Verify batch enrichment with 5 leads.

### Steps:

1. **Create 5 test leads** with different job titles:
   - Lead 1: Sales Director
   - Lead 2: Marketing Manager
   - Lead 3: Operations Manager
   - Lead 4: Finance Director
   - Lead 5: IT Manager

2. **Select all 5 leads** in the leads table

3. **Click "Enrich Selected Leads"**

4. **Expected Results**:
   - UI shows "Enriching 5 leads..."
   - After 10-15 seconds, all 5 leads update
   - Console shows:
     ```
     [Seamless.AI] Search request: 5 leads
     [Seamless.AI] Research IDs Submitted: 5
     [Seamless.AI] Expected Credits: 5
     [Seamless.AI] Enrichment completed: 4-5 successful, 0-1 failed
     ```
   - ~5 credits consumed

5. **Verify database**:
   - All 5 leads have updated fields
   - 5 enrichment job records created

### Success Criteria:
- ✅ Approximately 5 credits consumed
- ✅ All leads updated (or marked as needs_review)
- ✅ No duplicate API calls
- ✅ Proper error handling for any failed enrichments

---

## Test 4: Twenty Leads Enrichment (Credit Limit Test)

**Objective**: Verify credit limit protection (default: 20 credits per run).

### Steps:

1. **Create 20 test leads** with varied job titles

2. **Select all 20 leads**

3. **Click "Enrich Selected Leads"**

4. **Expected Results**:
   - UI shows confirmation dialog:
     ```
     "This will consume approximately 20 credits. Continue?"
     ```
   - If you click "Yes":
     - All 20 leads enriched
     - ~20 credits consumed
     - Console shows:
       ```
       [Seamless.AI] Research IDs Submitted: 20
       [Seamless.AI] Expected Credits: 20
       ```

5. **Verify database**:
   - All 20 leads have enrichment job records
   - Credit audit log shows exactly 20 credits

### Success Criteria:
- ✅ Confirmation dialog shown
- ✅ Exactly 20 credits consumed
- ✅ All leads processed
- ✅ No over-submission bug

---

## Test 5: Over-Limit Rejection (Hard Guard)

**Objective**: Verify that requests exceeding the hard limit (1000 credits) are rejected.

### Steps:

1. **Try to select 1500 leads** (if available in your database)

2. **Click "Enrich Selected Leads"**

3. **Expected Results**:
   - UI shows error:
     ```
     "Cannot enrich more than 1000 leads per request (hard limit). Selected: 1500"
     ```
   - No API calls made
   - No credits consumed

4. **Verify database**:
   - No enrichment job created
   - No changes to leads

### Success Criteria:
- ✅ Request rejected before API call
- ✅ User sees clear error message
- ✅ No credits wasted
- ✅ Hard limit enforced

---

## Test 6: Job Title Expansion Verification

**Objective**: Verify that job title expansion improves search results.

### Steps:

1. **Create a test lead**:
   - Name: Bob Johnson
   - Company: Small Business Inc
   - Job Title: Owner (simple title)

2. **Enrich the lead**

3. **Check console logs**:
   - Look for expanded titles:
     ```
     [Seamless.AI] Expanded job titles: ["Owner", "Founder", "CEO", "President", "Managing Director", ...]
     ```

4. **Verify result**:
   - Lead enriched with data from one of the expanded titles
   - Better match quality than simple "Owner" search

### Success Criteria:
- ✅ Job title expansion logged
- ✅ Multiple titles searched
- ✅ Better match found
- ✅ Confidence score reasonable

---

## Test 7: Audit Logging Verification

**Objective**: Verify that all enrichment runs are properly logged.

### Steps:

1. **Perform enrichments** (Tests 1-3)

2. **Check database** `enrichmentJobs` table:
   ```sql
   SELECT * FROM enrichmentJobs 
   WHERE userId = 'YOUR_USER_ID' 
   ORDER BY createdAt DESC 
   LIMIT 5;
   ```

3. **Verify each record contains**:
   - `jobId`: Unique identifier
   - `selectedLeadCount`: Number of leads selected
   - `searchRequestCount`: Number of searches performed
   - `researchRequestCount`: Number of research calls
   - `researchIdsSubmitted`: Array of IDs submitted
   - `successCount`: Successful enrichments
   - `failureCount`: Failed enrichments
   - `failureReasons`: Array of failure reasons (if any)
   - `creditsExpected`: Expected credits consumed
   - `status`: "completed", "failed", or "pending"
   - `createdAt`: Timestamp
   - `updatedAt`: Timestamp

4. **Check `.manus-logs/devserver.log`**:
   ```bash
   grep "enrichment" .manus-logs/devserver.log | tail -20
   ```

### Success Criteria:
- ✅ All enrichment runs logged
- ✅ Complete audit trail available
- ✅ Timestamps accurate
- ✅ All metrics captured

---

## Test 8: Error Handling & Recovery

**Objective**: Verify graceful error handling when Seamless.AI API fails.

### Steps:

1. **Temporarily disable Seamless.AI API key** in Settings (set to invalid key)

2. **Try to enrich a lead**

3. **Expected Results**:
   - UI shows error message:
     ```
     "Enrichment failed: API authentication error"
     ```
   - Console shows detailed error:
     ```
     [Seamless.AI] Error: Invalid API key
     ```
   - No credits consumed
   - Lead marked as "needs_review"

4. **Restore API key** and retry

5. **Expected Results**:
   - Enrichment succeeds
   - Lead updated normally

### Success Criteria:
- ✅ Clear error messages
- ✅ No credits wasted on failed requests
- ✅ Leads marked for manual review
- ✅ Easy recovery path

---

## Test 9: Network Interruption Recovery

**Objective**: Verify idempotency protects against network failures.

### Steps:

1. **Enrich a lead** (Test 1)

2. **During enrichment, simulate network failure**:
   - Disconnect internet or throttle network
   - Or use browser DevTools to block the request

3. **Expected Results**:
   - UI shows timeout/network error
   - Request fails gracefully
   - Lead NOT updated (transaction rolled back)

4. **Restore network** and retry enrichment

5. **Expected Results**:
   - Same Job ID used
   - Idempotency check recognizes retry
   - Enrichment completes successfully
   - No duplicate charges

### Success Criteria:
- ✅ Network failure handled gracefully
- ✅ Idempotency prevents duplicate charges
- ✅ Retry succeeds without issues
- ✅ Lead updated only once

---

## Test 10: Confidence Scoring & Needs Review

**Objective**: Verify that low-confidence matches are marked for manual review.

### Steps:

1. **Create a test lead with ambiguous data**:
   - Name: John Smith (very common)
   - Company: Tech Inc (generic)
   - Job Title: Manager (generic)
   - No email or location

2. **Enrich the lead**

3. **Expected Results**:
   - If confidence score < 80:
     - Lead marked as "needs_review" status
     - Console shows:
       ```
       [Seamless.AI] Confidence score too low (45/100). Marking for manual review.
       ```
   - If confidence score >= 80:
     - Lead updated normally

4. **Check database**:
   - Lead status = "needs_review" (if low confidence)
   - Confidence score stored in enrichment job

### Success Criteria:
- ✅ Low-confidence matches identified
- ✅ Leads marked for manual review
- ✅ Confidence score logged
- ✅ User can manually verify/update

---

## Troubleshooting

### Issue: "Insufficient credits" error

**Solution**:
1. Check Seamless.AI account balance at https://app.seamless.ai
2. Purchase more credits if needed
3. Update API key if account changed

### Issue: "API authentication error"

**Solution**:
1. Verify API key in Settings is correct
2. Check that API key hasn't expired
3. Regenerate API key in Seamless.AI dashboard

### Issue: Enrichment taking > 30 seconds

**Solution**:
1. Check internet connection
2. Verify Seamless.AI API status
3. Try with fewer leads (5 instead of 20)

### Issue: Leads not updating after enrichment

**Solution**:
1. Check browser console for errors
2. Verify database connection
3. Check `.manus-logs/devserver.log` for backend errors
4. Restart dev server: `pnpm run dev`

---

## Checkpoint Criteria

All tests must pass before marking the feature as production-ready:

- ✅ Test 1: Single lead enrichment (1 credit)
- ✅ Test 2: Double-click protection (409 error)
- ✅ Test 3: Five leads enrichment (~5 credits)
- ✅ Test 4: Twenty leads enrichment (~20 credits)
- ✅ Test 5: Over-limit rejection (hard guard)
- ✅ Test 6: Job title expansion working
- ✅ Test 7: Audit logging complete
- ✅ Test 8: Error handling graceful
- ✅ Test 9: Network recovery via idempotency
- ✅ Test 10: Confidence scoring & needs_review

## Next Steps

Once all tests pass:

1. **Deploy to production** using the Publish button
2. **Monitor audit logs** for the first week
3. **Collect feedback** from users on enrichment quality
4. **Adjust confidence threshold** if needed (currently 80)
5. **Consider expanding** to other data providers (Hunter.io, RocketReach, etc.)

---

## Support

For issues or questions:
1. Check `.manus-logs/devserver.log` for detailed error messages
2. Review `enrichmentJobs` table for audit trail
3. Contact Seamless.AI support: https://support.seamless.ai
