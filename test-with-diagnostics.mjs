/**
 * Enrichment Test with Full Diagnostics
 * Captures: URL, HTTP status, Content-Type, response body
 */

import { getLeadsByUserId, updateLead } from "./server/db.ts";
import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI.ts";

async function testEnrichmentWithDiagnostics() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("ERROR: SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
  console.log("ENRICHMENT TEST WITH FULL DIAGNOSTICS");
  console.log("=".repeat(80) + "\n");

  try {
    // Get first 3 leads
    const leads = await getLeadsByUserId(1);
    const testLeads = leads.slice(0, 3);

    if (testLeads.length === 0) {
      console.error("ERROR: No leads found");
      process.exit(1);
    }

    console.log(`Testing with ${testLeads.length} leads\n`);

    for (let i = 0; i < testLeads.length; i++) {
      const lead = testLeads[i];
      console.log(`\n${"=".repeat(80)}`);
      console.log(`LEAD ${i + 1}: ${lead.ownerName} (ID: ${lead.id})`);
      console.log(`Company: ${lead.companyName}, Title: ${lead.jobTitle}`);
      console.log("=".repeat(80) + "\n");

      try {
        // Step 1: Search
        console.log(">>> STEP 1: SEARCH");
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
          console.log("⚠️  No search results\n");
          continue;
        }

        const searchResultIds = searchResult.data.map((r) => r.searchResultId);
        console.log(`✅ Search succeeded: Found ${searchResultIds.length} result(s)\n`);

        // Step 2: Research
        console.log(">>> STEP 2: RESEARCH");
        const researchResult = await researchContacts(apiKey, searchResultIds);

        if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
          console.log("⚠️  No research request IDs\n");
          continue;
        }

        console.log(`✅ Research succeeded: Got ${researchResult.requestIds.length} request ID(s)\n`);

        // Step 3: Poll
        console.log(">>> STEP 3: POLL");
        const pollResult = await pollContactResults(apiKey, researchResult.requestIds, 120);
        const contacts = Array.isArray(pollResult) ? pollResult : (pollResult.contacts || pollResult.data || []);

        if (!contacts || contacts.length === 0) {
          console.log("⚠️  No poll results\n");
          continue;
        }

        console.log(`✅ Poll succeeded: Got ${contacts.length} contact(s)\n`);

        // Extract data
        const firstContact = contacts.find(c => c.contact && c.status === "done");
        
        if (!firstContact || !firstContact.contact) {
          console.log("⚠️  No valid contact data\n");
          continue;
        }

        const apiData = firstContact.contact;
        const extractedPhone = apiData.contactPhone1 || apiData.contactPhone2 || apiData.contactPhone3 || apiData.companyPhone1 || null;
        const extractedTitle = apiData.title || apiData.jobTitle || null;
        const extractedCompanySize = apiData.companyStaffCountRange || (apiData.companyStaffCount ? String(apiData.companyStaffCount) : null);
        const extractedEmail = apiData.email || apiData.personalEmail || null;
        const extractedCompany = apiData.company || null;
        const extractedLinkedIn = apiData.lIProfileUrl || null;

        // Update database
        await updateLead(lead.id, {
          phoneNumber: extractedPhone,
          jobTitle: extractedTitle,
          companySize: extractedCompanySize,
          email: extractedEmail,
          companyName: extractedCompany,
          linkedinUrl: extractedLinkedIn,
        });

        console.log(">>> EXTRACTED DATA");
        console.log(`✅ Phone: ${extractedPhone}`);
        console.log(`✅ Title: ${extractedTitle}`);
        console.log(`✅ Company Size: ${extractedCompanySize}`);
        console.log(`✅ Email: ${extractedEmail}`);
        console.log(`✅ Company: ${extractedCompany}`);
        console.log(`✅ LinkedIn: ${extractedLinkedIn}\n`);

      } catch (error) {
        console.log(`\n❌ ERROR: ${error.message}\n`);
        if (error.stack) {
          console.log("Stack trace:");
          console.log(error.stack);
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("TEST COMPLETE");
    console.log("=".repeat(80) + "\n");
    process.exit(0);

  } catch (error) {
    console.error("\nFATAL ERROR:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testEnrichmentWithDiagnostics();
