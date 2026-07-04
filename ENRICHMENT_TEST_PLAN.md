# Seamless.AI Enrichment Feature - Comprehensive Test Plan

## Implementation Review

### Current Implementation (seamlessAIEnrichmentRouter.ts)

**Key Safety Guards:**
1. **Line 139-147**: Global limit check - skips leads if `researchRequestsSubmitted >= maxResearchSubmissions`
2. **Line 202-207**: Hard safety guard - logs exactly 1 research ID being submitted per lead
3. **Line 210**: Single `researchContact()` call with `[bestMatch.result.id]` - array with exactly 1 ID
4. **Line 149**: One search per lead via `searchContacts()`

**Flow per Lead:**
1. Search Seamless.AI with filters (1 Search request)
2. Score all results and select best match (if score >= threshold)
3. Submit exactly 1 research ID (1 Research request)
4. Update lead with enriched data

## Test Cases

### Test 1: 20 Leads Submission - Verify searchResultIds Count
**Objective:** Confirm that selecting 20 leads submits exactly 20 searchResultIds (one per lead)

**Steps:**
1. Create 20 test leads in database
2. Call `enrichLeads` mutation with `leadIds: [1,2,3,...,20]`
3. Check console logs for "Research IDs Submitted: 1" appearing 20 times
4. Verify final stats show `researchRequestsSubmitted: 20`

**Expected Result:**
- Total research submissions = 20
- Each lead gets exactly 1 research ID
- No batch submissions or multi-ID arrays

---

### Test 2: Single Button Click - One Search + One Research Request
**Objective:** Verify one UI button click generates exactly one Search and one Research request

**Steps:**
1. Create 1 test lead with known data (name, company, email)
2. Click "Enrich Selected Leads" button in UI
3. Monitor network requests and console logs
4. Count Search API calls and Research API calls

**Expected Result:**
- Exactly 1 Search request to Seamless.AI
- Exactly 1 Research request to Seamless.AI
- No duplicate or batch calls

---

### Test 3: Safety Guard - Prevent Over-Submission
**Objective:** Verify that `maxResearchSubmissions` limit prevents over-submission

**Steps:**
1. Create 20 test leads
2. Call `enrichLeads` with `leadIds: [1,2,...,20]` and `maxResearchSubmissions: 5`
3. Check console logs for "Skipped due to global research submission limit"
4. Verify stats show:
   - `researchRequestsSubmitted: 5`
   - `skippedLeads: 15`

**Expected Result:**
- Only 5 leads are enriched
- Remaining 15 are skipped with clear message
- No over-submission occurs

---

### Test 4: Production UI Test - Single Lead Enrichment
**Objective:** Full end-to-end test with real UI interaction

**Steps:**
1. Log into application
2. Create 1 test lead with data:
   - Name: "John Smith"
   - Company: "Acme Corp"
   - Email: "john@acme.com"
   - Job Title: "CEO"
   - City: "San Francisco"
   - State: "CA"
   - Country: "USA"

3. Navigate to Leads page
4. Select the test lead
5. Click "Enrich Selected Leads" button
6. Wait for enrichment to complete
7. Refresh page
8. Verify enriched data is visible:
   - Phone number populated
   - Additional emails populated
   - Company size populated
   - LinkedIn URL populated
   - Industry populated

**Expected Result:**
- Lead enrichment completes without errors
- Enriched data persists after page refresh
- All available fields are populated from Seamless.AI

---

## Test Execution Order

1. **Unit Tests** (Test 1 & 3) - Verify logic and safety guards
2. **Integration Test** (Test 2) - Verify API call patterns
3. **E2E Test** (Test 4) - Verify full user workflow

## Success Criteria

✅ All 4 tests pass
✅ No over-submission of research IDs
✅ Enriched data persists in database
✅ UI reflects enriched data after refresh
✅ Safety guards prevent credit waste

## Logging to Verify

Check console logs for these patterns:

```
[SeamlessAIEnrichment] Searching Seamless.AI for lead X (name, company)
[SeamlessAIEnrichment] Search Results Returned: N
[SeamlessAIEnrichment] Selected Best Match: 1
[SeamlessAIEnrichment] Research IDs Submitted: 1
[SeamlessAIEnrichment] Expected Credits: 1
[SeamlessAIEnrichment] Enrichment process completed. Stats: { ... }
```

Each lead should show exactly these patterns once.
