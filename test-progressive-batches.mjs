/**
 * Progressive Batch Testing
 * Test 1 lead, 5 leads, 20 leads, 100 leads
 * Monitor: API rate limits, credit consumption, enrichment time, success rate
 */

import { getLeadById, updateLead, getLeadsByUserId } from "./server/db.ts";
import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI.ts";

async function testBatch(batchSize) {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("ERROR: SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`BATCH TEST: ${batchSize} LEADS`);
  console.log("=".repeat(80) + "\n");

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const results = [];

  try {
    // Get first N leads
    const leads = await getLeadsByUserId(1);
    const testLeads = leads.slice(0, batchSize);

    if (testLeads.length === 0) {
      console.error(`ERROR: No leads found in database`);
      return { success: false, message: "No leads found" };
    }

    console.log(`Found ${testLeads.length} leads to test\n`);

    for (let i = 0; i < testLeads.length; i++) {
      const lead = testLeads[i];
      const leadStartTime = Date.now();

      try {
        console.log(`[${i + 1}/${testLeads.length}] Processing: ${lead.ownerName} (ID: ${lead.id})`);

        // Search
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
          console.log(`  ⚠️  No search results`);
          failureCount++;
          continue;
        }

        const searchResultIds = searchResult.data.map((r) => r.searchResultId);

        // Research
        const researchResult = await researchContacts(apiKey, searchResultIds);

        if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
          console.log(`  ⚠️  No research request IDs`);
          failureCount++;
          continue;
        }

        // Poll
        const pollResult = await pollContactResults(apiKey, researchResult.requestIds, 120);
        const contacts = Array.isArray(pollResult) ? pollResult : (pollResult.contacts || pollResult.data || []);

        if (!contacts || contacts.length === 0) {
          console.log(`  ⚠️  No poll results`);
          failureCount++;
          continue;
        }

        // Find first valid contact
        const firstContact = contacts.find(c => c.contact && c.status === "done");
        
        if (!firstContact || !firstContact.contact) {
          console.log(`  ⚠️  No valid contact data`);
          failureCount++;
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

        const leadTime = Date.now() - leadStartTime;
        console.log(`  ✅ Success (${leadTime}ms) - Phone: ${extractedPhone}, Title: ${extractedTitle}`);
        
        successCount++;
        results.push({
          leadId: lead.id,
          name: lead.ownerName,
          phone: extractedPhone,
          title: extractedTitle,
          company: extractedCompany,
          time: leadTime,
        });

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        failureCount++;
      }
    }

    const totalTime = Date.now() - startTime;
    const avgTime = successCount > 0 ? Math.round(totalTime / successCount) : 0;

    console.log("\n" + "=".repeat(80));
    console.log(`BATCH RESULTS: ${batchSize} LEADS`);
    console.log("=".repeat(80));
    console.log(`Success: ${successCount}/${testLeads.length}`);
    console.log(`Failure: ${failureCount}/${testLeads.length}`);
    console.log(`Total Time: ${totalTime}ms`);
    console.log(`Avg Time per Lead: ${avgTime}ms`);
    console.log(`Success Rate: ${Math.round((successCount / testLeads.length) * 100)}%\n`);

    return {
      success: true,
      batchSize,
      successCount,
      failureCount,
      totalTime,
      avgTime,
      successRate: Math.round((successCount / testLeads.length) * 100),
      results,
    };

  } catch (error) {
    console.error("\n❌ BATCH TEST FAILED");
    console.error(error.message);
    return { success: false, message: error.message };
  }
}

async function runAllTests() {
  console.log("\n" + "=".repeat(80));
  console.log("PROGRESSIVE BATCH TESTING");
  console.log("Testing: 1 lead → 5 leads → 20 leads");
  console.log("=".repeat(80));

  const batchSizes = [1, 5, 20];
  const allResults = [];

  for (const size of batchSizes) {
    const result = await testBatch(size);
    allResults.push(result);
    
    if (!result.success) {
      console.error(`\nBatch test failed at size ${size}`);
      break;
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  for (const result of allResults) {
    if (result.success) {
      console.log(`${result.batchSize} leads: ${result.successCount}/${result.batchSize} success, ${result.avgTime}ms avg`);
    } else {
      console.log(`${result.batchSize} leads: FAILED - ${result.message}`);
    }
  }

  console.log("\n✅ Progressive testing complete\n");
  process.exit(0);
}

runAllTests().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
