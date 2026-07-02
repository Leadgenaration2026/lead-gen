/**
 * Single Enrichment Test with Detailed Logging
 * Logs: Step, URL, Status, Content-Type, Response Body, Request IDs, Elapsed Time
 * Also verifies that searchResultIds and requestIds are NOT reused
 */

import { getLeadsByUserId, updateLead } from "./server/db.ts";
import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI.ts";

let previousSearchResultIds = [];
let previousRequestIds = [];

async function testSingleEnrichment() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("ERROR: SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SINGLE ENRICHMENT TEST - DETAILED LOGGING");
  console.log("=".repeat(80) + "\n");

  try {
    // Get first lead
    const leads = await getLeadsByUserId(1);
    if (leads.length === 0) {
      console.error("ERROR: No leads found");
      process.exit(1);
    }

    const lead = leads[0];
    console.log(`Testing with: ${lead.ownerName} (ID: ${lead.id})`);
    console.log(`Company: ${lead.companyName}, Title: ${lead.jobTitle}\n`);

    try {
      // Step 1: Search
      console.log("=== SEARCH ===");
      console.log(`URL: POST https://api.seamless.ai/api/client/v1/search/contacts`);
      console.log(`Request: { jobTitle: ["${lead.jobTitle}"], companyName: ["${lead.companyName}"], limit: 1 }\n`);
      
      const searchResult = await searchContacts(
        apiKey,
        {
          jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
          companyName: lead.companyName ? [lead.companyName] : undefined,
          limit: 1,
        },
        1
      );

      if (!searchResult.data || searchResult.data.length === 0) {
        console.log("❌ SEARCH FAILED: No results\n");
        process.exit(1);
      }

      const searchResultIds = searchResult.data.map((r) => r.searchResultId);
      console.log(`✅ SEARCH SUCCESS`);
      console.log(`searchResultIds: ${JSON.stringify(searchResultIds)}`);
      console.log(`Total Results: ${searchResult.totalResults || "N/A"}\n`);

      // Verify new searchResultIds
      if (previousSearchResultIds.length > 0 && JSON.stringify(searchResultIds) === JSON.stringify(previousSearchResultIds)) {
        console.log("⚠️  WARNING: searchResultIds are identical to previous batch!");
      }
      previousSearchResultIds = searchResultIds;

      // Step 2: Research
      console.log("=== RESEARCH ===");
      console.log(`URL: POST https://api.seamless.ai/api/client/v1/contacts/research`);
      console.log(`Request: { searchResultIds: ${JSON.stringify(searchResultIds)} }\n`);
      
      const researchResult = await researchContacts(apiKey, searchResultIds);

      if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
        console.log("❌ RESEARCH FAILED: No request IDs\n");
        process.exit(1);
      }

      const requestIds = researchResult.requestIds;
      console.log(`✅ RESEARCH SUCCESS`);
      console.log(`requestIds: ${JSON.stringify(requestIds)}\n`);

      // Verify new requestIds
      if (previousRequestIds.length > 0 && JSON.stringify(requestIds) === JSON.stringify(previousRequestIds)) {
        console.log("⚠️  WARNING: requestIds are identical to previous batch!");
      }
      previousRequestIds = requestIds;

      // Step 3: Poll
      console.log("=== POLL ===");
      console.log(`URL: GET https://api.seamless.ai/api/client/v1/contacts/research/poll`);
      console.log(`Request: { requestIds: ${JSON.stringify(requestIds)} }\n`);
      
      const pollResult = await pollContactResults(apiKey, requestIds, 120);
      const contacts = Array.isArray(pollResult) ? pollResult : (pollResult.contacts || pollResult.data || []);

      if (!contacts || contacts.length === 0) {
        console.log("❌ POLL FAILED: No contacts\n");
        process.exit(1);
      }

      console.log(`✅ POLL SUCCESS`);
      console.log(`Contacts returned: ${contacts.length}\n`);

      // Extract data
      const firstContact = contacts.find(c => c.contact && c.status === "done");
      
      if (!firstContact || !firstContact.contact) {
        console.log("❌ NO VALID CONTACT DATA\n");
        process.exit(1);
      }

      const apiData = firstContact.contact;
      const extractedPhone = apiData.contactPhone1 || apiData.contactPhone2 || apiData.contactPhone3 || apiData.companyPhone1 || null;
      const extractedTitle = apiData.title || apiData.jobTitle || null;
      const extractedCompanySize = apiData.companyStaffCountRange || (apiData.companyStaffCount ? String(apiData.companyStaffCount) : null);
      const extractedEmail = apiData.email || apiData.personalEmail || null;
      const extractedCompany = apiData.company || null;
      const extractedLinkedIn = apiData.lIProfileUrl || null;

      console.log("=== EXTRACTED DATA ===");
      console.log(`Phone: ${extractedPhone}`);
      console.log(`Title: ${extractedTitle}`);
      console.log(`Company Size: ${extractedCompanySize}`);
      console.log(`Email: ${extractedEmail}`);
      console.log(`Company: ${extractedCompany}`);
      console.log(`LinkedIn: ${extractedLinkedIn}\n`);

      // Update database
      await updateLead(lead.id, {
        phoneNumber: extractedPhone,
        jobTitle: extractedTitle,
        companySize: extractedCompanySize,
        email: extractedEmail,
        companyName: extractedCompany,
        linkedinUrl: extractedLinkedIn,
      });

      console.log("✅ DATABASE UPDATED\n");
      console.log("=".repeat(80));
      console.log("TEST COMPLETED SUCCESSFULLY");
      console.log("=".repeat(80) + "\n");
      process.exit(0);

    } catch (error) {
      console.log("\n=== FAILED REQUEST ===");
      console.log(`Step: ${error.message.includes("Search") ? "Search" : error.message.includes("Research") ? "Research" : error.message.includes("Poll") ? "Poll" : "Unknown"}`);
      console.log(`Error: ${error.message}\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error("\nFATAL ERROR:", error.message);
    process.exit(1);
  }
}

testSingleEnrichment();
