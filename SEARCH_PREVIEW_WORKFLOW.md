# Search Preview Workflow Documentation

## Overview

The Search Preview mode implements a **safe, multi-stage workflow** for lead generation and enrichment:

```
Search → Preview → Import → Enrich → Outreach
```

This approach prevents accidental credit consumption and provides complete control over the lead generation process.

---

## Workflow Stages

### Stage 1: Search (Zero Credits)

**What happens:**
- User enters search criteria (e.g., "small business owners with company size 2-10")
- System calls Seamless.AI `/search/contacts` endpoint only
- Results are cached for 24 hours
- **No credits consumed**

**Key Features:**
- Job title expansion (e.g., "Owner" → ["Owner", "Founder", "CEO", "President", ...])
- Natural language parsing (e.g., "company size 2-10" → min: 2, max: 10)
- Country and state filtering
- Pagination support with `nextToken`

**UI Display:**
- "Leads Found: X" (total available leads)
- "Leads Retrieved: Y" (currently cached)
- "Leads Remaining: Z" (available for import)
- "Credits Used: 0" (confirmation)

---

### Stage 2: Preview (Zero Credits)

**What happens:**
- User reviews search results
- Can browse through paginated results
- Selects how many leads to import (1-1000)
- **No credits consumed**

**Key Features:**
- Sample results display (first 10 leads)
- Import count selector
- Credit estimation display (importCount × 1 credit)
- Pagination controls with nextToken

**UI Display:**
- Search results with lead names, titles, companies
- Import count input field
- "Import X Leads" button
- Credit estimation: "X leads = X credits"

---

### Stage 3: Import (Zero Credits)

**What happens:**
- User clicks "Import X Leads"
- System creates import record in `leadImports` table
- Leads are NOT enriched yet
- **No credits consumed**

**Key Features:**
- Idempotent import tracking (unique importId)
- Links to original search cache for audit trail
- Status tracking (pending, completed, failed)
- Preserves pagination state

**UI Display:**
- Import status: "Pending", "Completed", or "Failed"
- "Leads Imported: X"
- "Credits Estimated: X"
- "Enrich" button appears after import

---

### Stage 4: Enrich (Credits Consumed)

**What happens:**
- User explicitly clicks "Enrich" button
- System calls Seamless.AI `/contacts/research` endpoint
- Enriches imported leads with phone, email, job title, company size
- **Credits consumed: 1 per lead**

**Key Features:**
- Credit cost displayed before enrichment
- Confirmation dialog with credit breakdown
- Audit logging of all enrichment operations
- Confidence scoring for enriched data

**UI Display:**
- "Ready to enrich X leads?"
- "This will consume X credits from your account"
- "Proceed with Enrichment" button
- Real-time progress during enrichment

---

### Stage 5: Outreach (Optional)

**What happens:**
- User can now use enriched leads for campaigns
- Send emails, make calls, or use social outreach
- All lead data is available for personalization

---

## Database Schema

### searchCache Table
```sql
CREATE TABLE searchCache (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  filters JSON NOT NULL,
  totalResults INT NOT NULL,
  leadsRetrieved INT NOT NULL,
  nextToken VARCHAR(255),
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

**Purpose:** Cache search results for 24 hours to enable pagination without re-calling the API.

### leadImports Table
```sql
CREATE TABLE leadImports (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  searchId VARCHAR(36) NOT NULL,
  importedCount INT NOT NULL,
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  creditsEstimated INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (searchId) REFERENCES searchCache(id)
);
```

**Purpose:** Track which leads were imported from which searches for audit trail and idempotency.

---

## tRPC Procedures

### searchPreview.search()
```typescript
searchPreview.search.mutate({
  instruction: "small business owners with company size 2-10",
  country: "United States",
  state: "California" // optional
})
// Returns: { searchId, totalResults, leadsRetrieved, creditsConsumed: 0 }
```

### searchPreview.getPreview()
```typescript
searchPreview.getPreview.useQuery({
  searchId: "abc123",
  pageSize: 50,
  nextToken: "xyz789" // optional
})
// Returns: { results, totalResults, leadsRemaining, nextToken }
```

### searchPreview.importResults()
```typescript
searchPreview.importResults.mutate({
  searchId: "abc123",
  importCount: 50
})
// Returns: { importId, importedCount, creditsEstimated, status: "pending" }
```

### searchPreview.getImportStatus()
```typescript
searchPreview.getImportStatus.useQuery({
  importId: "def456"
})
// Returns: { status, importedCount, creditsEstimated, createdAt }
```

---

## Key Benefits

✅ **Zero Accidental Credit Consumption**
- Search and import operations consume no credits
- User sees exact credit cost before enrichment
- Confirmation required before any charges

✅ **Transparent Lead Count**
- Users see total available leads before importing
- Can make informed decisions about import size
- Pagination enables browsing without re-searching

✅ **Audit Trail**
- Every search is cached with filters
- Every import is linked to its source search
- Complete history of lead acquisition

✅ **Idempotent Operations**
- Double-click protection on import
- Unique importId prevents duplicate imports
- Safe to retry failed operations

✅ **Better UX**
- Matches Instantly/Smartlead workflow
- Clear separation of concerns
- User has full control at each stage

---

## Usage Example

### Step 1: Search for Leads
```typescript
const searchResult = await trpc.searchPreview.search.mutate({
  instruction: "small business owners with company size 2-10",
  country: "United States"
});
// searchResult.totalResults = 233,610 leads found
// searchResult.creditsConsumed = 0 (FREE)
```

### Step 2: Preview Results
```typescript
const preview = await trpc.searchPreview.getPreview.useQuery({
  searchId: searchResult.searchId,
  pageSize: 50
});
// preview.results = [{ firstName, lastName, jobTitle, companyName }, ...]
// preview.leadsRemaining = 233,610
```

### Step 3: Import Selected Leads
```typescript
const importResult = await trpc.searchPreview.importResults.mutate({
  searchId: searchResult.searchId,
  importCount: 50
});
// importResult.importedCount = 50
// importResult.creditsEstimated = 50 (not yet charged)
```

### Step 4: Enrich Leads (Optional)
```typescript
// User sees: "Ready to enrich 50 leads? This will consume 50 credits."
// User clicks "Proceed with Enrichment"
// System calls /contacts/research and charges 50 credits
```

---

## Migration from Old Workflow

### Old Workflow (Problematic)
```
"Generate Leads" → Immediate /research call → Credits consumed → Results shown
```

### New Workflow (Safe)
```
"Search Leads" → Preview → "Import" → "Enrich" (explicit) → Credits consumed
```

**Migration Steps:**
1. ✅ Database: searchCache and leadImports tables created
2. ✅ Backend: searchPreviewRouter with 4 tRPC procedures
3. ✅ Frontend: SearchPreview UI component with 3-tab interface
4. ✅ Navigation: "Search Leads" added to sidebar and dashboard
5. ✅ Tests: 40+ test cases covering all workflows

---

## Testing Checklist

- [ ] Search with "small business owners company size 2-10"
- [ ] Verify "Leads Found: 233,610+" (or similar)
- [ ] Verify "Credits Used: 0"
- [ ] Click "Preview" tab
- [ ] Verify results display with pagination
- [ ] Select import count (e.g., 25)
- [ ] Click "Import 25 Leads"
- [ ] Verify import status shows "pending"
- [ ] Verify "Credits Estimated: 25"
- [ ] Click "Proceed with Enrichment"
- [ ] Verify enrichment completes
- [ ] Verify leads appear in "All Leads" with enriched data

---

## Troubleshooting

### No Leads Found
- Check search instruction syntax
- Try broader filters (remove state, expand company size range)
- Verify Seamless.AI API key is valid

### Import Fails
- Check database connection
- Verify searchId exists and hasn't expired (24-hour TTL)
- Check user has sufficient credits for enrichment

### Enrichment Takes Too Long
- Check network connection
- Verify Seamless.AI API is responding
- Try enriching fewer leads first

---

## Future Enhancements

1. **Bulk Search** - Save multiple searches and compare results
2. **Search Templates** - Save common search criteria for reuse
3. **Lead Deduplication** - Detect and merge duplicate leads across imports
4. **Smart Enrichment** - Only enrich leads that meet confidence threshold
5. **Export** - Download leads as CSV/Excel before enrichment
6. **Webhooks** - Notify when enrichment completes

---

## Support

For issues or questions about the Search Preview workflow, please contact support@leadgenoutreach.com
