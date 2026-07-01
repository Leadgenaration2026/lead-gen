/**
 * Single Fresh Lead Enrichment Test
 * Tests Search → Research → Poll workflow with a new lead
 */

import { getLeadById } from "./server/db.ts";
import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI.ts";

async function testFreshLead() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("ERROR: SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
  console.log("FRESH LEAD ENRICHMENT TEST");
  console.log("=".repeat(80) + "\n");

  try {
    // Get the fresh lead (Sarah Johnson, Product Manager at Google)
    const lead = await getLeadById(1380001);
    
    if (!lead) {
      console.error("ERROR: No lead found with ID 1350002");
      process.exit(1);
    }

    console.log(`Testing with fresh lead: ${lead.ownerName} (ID: ${lead.id})`);
    console.log(`Job Title: ${lead.jobTitle}`);
    console.log(`Company: ${lead.companyName}\n`);

    // === STEP 1: SEARCH ===
    console.log("=".repeat(80));
    console.log("STEP 1: SEARCH");
    console.log("=".repeat(80));
    console.log(`Searching for: ${lead.jobTitle} at ${lead.companyName}\n`);

    let searchResult;
    try {
      searchResult = await searchContacts(
        apiKey,
        {
          jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
          companyName: lead.companyName ? [lead.companyName] : undefined,
          limit: 5,
        },
        5
      );
      console.log(`Found ${searchResult.data.length} results`);
    } catch (error) {
      console.error("\n❌ SEARCH FAILED");
      console.error("Error:", error.message);
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
      console.log(`Got ${researchResult.requestIds.length} request IDs`);
    } catch (error) {
      console.error("\n❌ RESEARCH FAILED");
      console.error("Error:", error.message);
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
    } catch (error) {
      console.error("\n❌ POLL FAILED");
      console.error("Error:", error.message);
      process.exit(1);
    }

    // Handle both response formats
    const contacts = Array.isArray(pollResult) ? pollResult : (pollResult.contacts || pollResult.data || []);
    
    if (!contacts || contacts.length === 0) {
      console.error("\n❌ POLL FAILED: No contacts returned");
      process.exit(1);
    }

    console.log(`\n✅ Poll succeeded. Got ${contacts.length} contact(s)\n`);

    // === EXTRACT DATA ===
    console.log("=".repeat(80));
    console.log("EXTRACTED DATA");
    console.log("=".repeat(80) + "\n");

    for (let i = 0; i < Math.min(3, contacts.length); i++) {
      const contact = contacts[i];
      
      // Skip duplicates/missing
      if (!contact.contact && contact.status !== "done") {
        console.log(`Contact ${i + 1}: Status=${contact.status} (skipped)`);
        continue;
      }

      const data = contact.contact || contact;
      const phone = data.contactPhone1 || data.contactPhone2 || data.contactPhone3 || data.companyPhone1 || null;
      const title = data.title || data.jobTitle || null;
      const companySize = data.companyStaffCountRange || (data.companyStaffCount ? String(data.companyStaffCount) : null);
      const email = data.email || data.personalEmail || null;
      const company = data.company || null;
      const linkedin = data.lIProfileUrl || null;

      console.log(`Contact ${i + 1}:`);
      console.log(`  Name: ${data.firstName} ${data.lastName}`);
      console.log(`  Email: ${email}`);
      console.log(`  Phone: ${phone}`);
      console.log(`  Title: ${title}`);
      console.log(`  Company: ${company}`);
      console.log(`  Company Size: ${companySize}`);
      console.log(`  LinkedIn: ${linkedin}`);
      console.log();
    }

    console.log("=".repeat(80));
    console.log("✅ SUCCESS: Fresh lead enrichment completed");
    console.log("=".repeat(80));

    process.exit(0);
  } catch (error) {
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

testFreshLead();
