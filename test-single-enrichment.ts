/**
 * Single Lead Enrichment Test
 * Tests Search → Research → Poll workflow with detailed logging
 * Fails fast on any API error
 */

import { getLeadById } from "./server/db";
import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI";

async function testSingleEnrichment() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("ERROR: SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SINGLE LEAD ENRICHMENT TEST");
  console.log("=".repeat(80) + "\n");

  try {
    // Get first lead from database (ID 1)
    const lead = await getLeadById(1);
    
    if (!lead) {
      console.error("ERROR: No lead found with ID 1");
      process.exit(1);
    }

    console.log(`Testing with lead: ${lead.ownerName} (ID: ${lead.id})\n`);

    // === STEP 1: SEARCH ===
    console.log("=".repeat(80));
    console.log("STEP 1: SEARCH");
    console.log("=".repeat(80));
    console.log(`Searching for: ${lead.jobTitle || "any job title"}\n`);

    let searchResult;
    try {
      searchResult = await searchContacts(
        apiKey,
        {
          jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
          limit: 1,
        },
        1
      );
      console.log("Search Response:", JSON.stringify(searchResult, null, 2));
    } catch (error: any) {
      console.error("\n❌ SEARCH FAILED");
      console.error("Error:", error.message);
      if (error.cause) {
        console.error("Details:", JSON.stringify(error.cause, null, 2));
      }
      process.exit(1);
    }

    if (!searchResult.data || searchResult.data.length === 0) {
      console.error("\n❌ SEARCH FAILED: No results returned");
      process.exit(1);
    }

    const searchResultIds = searchResult.data.map((r) => r.searchResultId);
    console.log(`\n✅ Search succeeded. Found ${searchResultIds.length} result(s)\n`);

    // === STEP 2: RESEARCH ===
    console.log("=".repeat(80));
    console.log("STEP 2: RESEARCH");
    console.log("=".repeat(80));
    console.log(`Submitting ${searchResultIds.length} result(s) for research\n`);

    let researchResult;
    try {
      researchResult = await researchContacts(apiKey, searchResultIds);
      console.log("Research Response:", JSON.stringify(researchResult, null, 2));
    } catch (error: any) {
      console.error("\n❌ RESEARCH FAILED");
      console.error("Error:", error.message);
      if (error.cause) {
        console.error("Details:", JSON.stringify(error.cause, null, 2));
      }
      process.exit(1);
    }

    if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
      console.error("\n❌ RESEARCH FAILED: No request IDs returned");
      process.exit(1);
    }

    console.log(`\n✅ Research succeeded. Got ${researchResult.requestIds.length} request ID(s)\n`);

    // === STEP 3: POLL ===
    console.log("=".repeat(80));
    console.log("STEP 3: POLL");
    console.log("=".repeat(80));
    console.log(`Polling for results (max 120 attempts)\n`);

    let pollResult;
    try {
      pollResult = await pollContactResults(apiKey, researchResult.requestIds, 120);
      console.log("Poll Response:", JSON.stringify(pollResult, null, 2));
    } catch (error: any) {
      console.error("\n❌ POLL FAILED");
      console.error("Error:", error.message);
      if (error.cause) {
        console.error("Details:", JSON.stringify(error.cause, null, 2));
      }
      process.exit(1);
    }

    if (!pollResult.data || pollResult.data.length === 0) {
      console.error("\n❌ POLL FAILED: No contacts returned");
      process.exit(1);
    }

    console.log(`\n✅ Poll succeeded. Got ${pollResult.data.length} contact(s)\n`);

    // === SUMMARY ===
    console.log("=".repeat(80));
    console.log("SUCCESS: All steps completed");
    console.log("=".repeat(80));
    console.log("\nExtracted Data:");
    const contact = pollResult.data[0];
    console.log({
      phone: contact.contactPhone1 || contact.contactPhone2 || contact.contactPhone3 || contact.companyPhone1 || null,
      title: contact.jobTitle || contact.title || null,
      companySize: contact.companyStaffCountRange || contact.companyStaffCount || null,
      email: contact.email || null,
      company: contact.company || null,
      linkedin: contact.lIProfileUrl || null,
    });

    process.exit(0);
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error("FATAL ERROR");
    console.error("=".repeat(80));
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack Trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testSingleEnrichment();
