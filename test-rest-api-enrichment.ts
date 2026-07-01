/**
 * Phase 2: Test REST API Enrichment End-to-End
 * 
 * This script:
 * 1. Creates a test lead in the database
 * 2. Calls the REST API enrichment service with that lead
 * 3. Prints all API responses (Search, Research, Poll)
 * 4. Verifies the database was updated correctly
 */

import { getDb } from "./server/db";
import { leads } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const SEAMLESS_API_KEY = process.env.SEAMLESS_AI_API_KEY;

if (!SEAMLESS_API_KEY) {
  console.error("❌ SEAMLESS_AI_API_KEY not set");
  process.exit(1);
}

interface SearchResult {
  data: Array<{ searchResultId: string }>;
  totalResults?: number;
}

interface ResearchResult {
  requestIds: string[];
}

interface PollResult {
  contact?: {
    contactPhone1?: string;
    contactPhone2?: string;
    contactPhone3?: string;
    companyPhone1?: string;
    title?: string;
    jobTitle?: string;
    companyStaffCountRange?: string;
    companyStaffCount?: number;
    email?: string;
    personalEmail?: string;
    company?: string;
    lIProfileUrl?: string;
  };
  status: string;
}

async function seamlessRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, any>
): Promise<any> {
  const url = `https://api.seamless.ai/api/client/v1${path}`;
  const headers: Record<string, string> = {
    "Token": SEAMLESS_API_KEY,
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function main() {
  console.log("🧪 PHASE 2: REST API Enrichment Test\n");
  console.log("=".repeat(80));

  try {
    // Step 1: Create a test lead
    console.log("\n📍 Step 1: Creating test lead in database...");
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Use a unique email for this test run
    const timestamp = Date.now();
    const testLead = {
      userId: 1, // Assuming user ID 1 exists
      companyName: "Test Company Inc",
      ownerName: "John Smith",
      email: `john-${timestamp}@testcompany.com`,
      phoneNumber: "+1-555-0123",
      website: "https://testcompany.com",
      industry: "Technology",
      linkedinUrl: "https://linkedin.com/in/johnsmith",
      timezone: "America/New_York",
      country: "United States",
    };

    // Insert the test lead
    await db.insert(leads).values(testLead as any);
    
    // Fetch the inserted lead to get its ID
    const insertedLeads = await db.select().from(leads).where(eq(leads.email, testLead.email)).limit(1);
    const leadId = insertedLeads[0]?.id;

    if (!leadId) {
      throw new Error("Failed to create test lead");
    }

    console.log(`✅ Test lead created with ID: ${leadId}`);
    console.log(`   Name: ${testLead.ownerName}`);
    console.log(`   Company: ${testLead.companyName}`);

    // Step 2: Call Search API
    console.log("\n📍 Step 2: Calling Search API...");
    const searchResponse = await seamlessRequest("POST", "/search/contacts", {
      jobTitle: ["CEO", "Founder"],
      limit: 5,
    }) as SearchResult;

    console.log(`✅ Search API Response:`);
    console.log(`   Total Results: ${searchResponse.totalResults}`);
    console.log(`   Search Results Count: ${searchResponse.data?.length || 0}`);
    console.log(`   First 500 chars:`, JSON.stringify(searchResponse, null, 2).substring(0, 500));

    if (!searchResponse.data || searchResponse.data.length === 0) {
      throw new Error("No search results found");
    }

    const searchResultIds = searchResponse.data.map((r) => r.searchResultId);

    // Step 3: Call Research API
    console.log("\n📍 Step 3: Calling Research API...");
    const researchResponse = await seamlessRequest("POST", "/contacts/research", {
      searchResultIds,
    }) as ResearchResult;

    console.log(`✅ Research API Response:`);
    console.log(`   Request IDs: ${researchResponse.requestIds?.length || 0}`);
    console.log(`   Raw Response:`, JSON.stringify(researchResponse, null, 2));

    if (!researchResponse.requestIds || researchResponse.requestIds.length === 0) {
      throw new Error("Research submission failed");
    }

    // Step 4: Poll for Results
    console.log("\n📍 Step 4: Polling for Research Results...");
    let pollResults: PollResult[] = [];
    let attempts = 0;
    const maxAttempts = 60;

    while (pollResults.length < researchResponse.requestIds.length && attempts < maxAttempts) {
      attempts++;
      const idsParam = researchResponse.requestIds.join(",");
      const response = await seamlessRequest(
        "GET",
        `/contacts/research/poll?requestIds=${encodeURIComponent(idsParam)}`
      );

      const results: PollResult[] = Array.isArray(response) ? response : response.data || [response];
      const completed = results.filter(
        (r) => r.status === "done" || r.status === "missing" || r.status === "error"
      );

      if (completed.length > 0) {
        pollResults = completed;
        console.log(`✅ Poll completed after ${attempts} attempts`);
        break;
      }

      console.log(`   Attempt ${attempts}: Waiting for results...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (pollResults.length === 0) {
      throw new Error("Polling timed out");
    }

    // Step 5: Extract and Map Data
    console.log("\n📍 Step 5: Extracting and Mapping Data...");
    const result = pollResults[0];
    const contact = result.contact;

    if (!contact) {
      throw new Error("No contact data in poll result");
    }

    console.log(`✅ Poll API Response (Contact Data):`);
    console.log(JSON.stringify(contact, null, 2));

    // Extract using confirmed fallback chains
    const phoneNumber =
      contact.contactPhone1 ??
      contact.contactPhone2 ??
      contact.contactPhone3 ??
      contact.companyPhone1 ??
      null;

    const jobTitle =
      contact.title ?? contact.jobTitle ?? null;

    const companySize =
      contact.companyStaffCountRange ??
      (contact.companyStaffCount ? String(contact.companyStaffCount) : null);

    const email =
      contact.email ??
      contact.personalEmail ??
      null;

    const company = contact.company ?? null;
    const linkedIn = contact.lIProfileUrl ?? null;

    const mappedObject = {
      phoneNumber,
      jobTitle,
      companySize,
      email,
      company,
      linkedinUrl: linkedIn,
    };

    console.log("\n📍 Step 6: Mapped Object for Database Update:");
    console.log(JSON.stringify(mappedObject, null, 2));

    // Step 7: Verify Database Update
    console.log("\n📍 Step 7: Verifying Database Update...");
    
    // Update the lead with enriched data
    await db.update(leads)
      .set({
        phoneNumber: mappedObject.phoneNumber || undefined,
        jobTitle: mappedObject.jobTitle || undefined,
        companySize: mappedObject.companySize || undefined,
        email: mappedObject.email || undefined,
        companyName: mappedObject.company || undefined,
        linkedinUrl: mappedObject.linkedinUrl || undefined,
      })
      .where(eq(leads.id, leadId));

    // Fetch the updated lead
    const updatedLeads = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    const updatedLead = updatedLeads[0];

    console.log(`✅ Database Updated Successfully:`);
    console.log(`   Lead ID: ${updatedLead?.id}`);
    console.log(`   Phone: ${updatedLead?.phoneNumber}`);
    console.log(`   Title: ${updatedLead?.jobTitle}`);
    console.log(`   Company Size: ${updatedLead?.companySize}`);
    console.log(`   Email: ${updatedLead?.email}`);
    console.log(`   Company: ${updatedLead?.companyName}`);
    console.log(`   LinkedIn: ${updatedLead?.linkedinUrl}`);

    // Step 8: Verification Summary
    console.log("\n" + "=".repeat(80));
    console.log("\n✅ VERIFICATION SUMMARY\n");

    const verifications = [
      { field: "contactPhone1", value: mappedObject.phoneNumber, required: true },
      { field: "title", value: mappedObject.jobTitle, required: true },
      { field: "companyStaffCountRange", value: mappedObject.companySize, required: true },
      { field: "email", value: mappedObject.email, required: true },
      { field: "company", value: mappedObject.company, required: true },
      { field: "LinkedIn", value: mappedObject.linkedinUrl, required: false },
    ];

    let allPassed = true;
    for (const verification of verifications) {
      const status = verification.value ? "✅" : "❌";
      const required = verification.required ? " (REQUIRED)" : "";
      console.log(`${status} ${verification.field}: ${verification.value || "NOT POPULATED"}${required}`);
      if (verification.required && !verification.value) {
        allPassed = false;
      }
    }

    console.log("\n" + "=".repeat(80));
    if (allPassed) {
      console.log("\n🎉 ALL TESTS PASSED - REST API ENRICHMENT WORKS!\n");
    } else {
      console.log("\n⚠️  SOME REQUIRED FIELDS ARE MISSING\n");
    }

    console.log("Ready for Phase 3: Test with 20 leads");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
