/**
 * Test script to capture actual JSON response from Seamless.AI Poll endpoint
 * Run with: npx tsx test-seamless-poll.ts
 * 
 * This script will:
 * 1. Get your Seamless.AI API key from environment
 * 2. Search for 1 contact
 * 3. Submit for research
 * 4. Poll until complete
 * 5. Log the complete JSON response
 */

import { searchContacts, researchContacts, pollContactResults } from "./server/seamlessAI";

async function testSeamlessPoll() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ SEAMLESS_AI_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log("🔍 Testing Seamless.AI Poll endpoint...\n");

  try {
    // Step 1: Search for contacts
    console.log("📍 Step 1: Searching for contacts...");
    const searchResult = await searchContacts(apiKey, {
      jobTitle: ["CEO"],
      limit: 1,
    }, 1);

    console.log(`✅ Found ${searchResult.data.length} contact(s)`);
    console.log(`📊 Total available: ${searchResult.supplementalData?.totalResults || "unknown"}\n`);

    if (searchResult.data.length === 0) {
      console.error("❌ No contacts found. Try different search filters.");
      process.exit(1);
    }

    const searchResultIds = searchResult.data.map(r => r.searchResultId);
    console.log(`🔑 Search Result IDs: ${searchResultIds.join(", ")}\n`);

    // Step 2: Submit for research
    console.log("📍 Step 2: Submitting for research (enrichment)...");
    const researchResult = await researchContacts(apiKey, searchResultIds);

    console.log(`✅ Submitted ${researchResult.requestIds.length} request(s)`);
    console.log(`📋 Request IDs: ${researchResult.requestIds.join(", ")}\n`);

    // Step 3: Poll for results
    console.log("📍 Step 3: Polling for enrichment results...");
    const pollResults = await pollContactResults(apiKey, researchResult.requestIds, 60, 2000);

    console.log(`✅ Received ${pollResults.length} result(s)\n`);

    // Step 4: Log complete JSON response
    console.log("=" .repeat(80));
    console.log("📄 COMPLETE JSON RESPONSE FROM POLL ENDPOINT:");
    console.log("=" .repeat(80));
    console.log(JSON.stringify(pollResults, null, 2));
    console.log("=" .repeat(80));

    // Step 5: Analyze field names
    if (pollResults.length > 0) {
      const firstResult = pollResults[0];
      console.log("\n🔍 FIELD ANALYSIS:");
      console.log("---");

      if (firstResult.contact) {
        const contact = firstResult.contact;
        console.log("✅ Contact object found. Available fields:");
        console.log(JSON.stringify(Object.keys(contact), null, 2));

        console.log("\n📌 Key enrichment fields:");
        console.log(`  • phone: ${contact.phone || contact.phoneNumber || contact.workPhone || "NOT FOUND"}`);
        console.log(`  • email: ${contact.email || contact.personalEmail || "NOT FOUND"}`);
        console.log(`  • title: ${contact.title || contact.jobTitle || contact.position || "NOT FOUND"}`);
        console.log(`  • company: ${contact.company || "NOT FOUND"}`);
        console.log(`  • companySize: ${contact.companySize || contact.employeeCount || contact.employees || "NOT FOUND"}`);
        console.log(`  • linkedin: ${contact.lIProfileUrl || "NOT FOUND"}`);
      } else {
        console.log("⚠️  No contact object in response. Status:", firstResult.status);
      }
    }

    console.log("\n✅ Test complete!");

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

testSeamlessPoll();
