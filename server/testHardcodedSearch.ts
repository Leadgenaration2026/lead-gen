/**
 * Hard-Coded Search Test Endpoint
 * 
 * This bypasses parseInstructionToFilters() completely and sends
 * a hard-coded request to Seamless.AI to test if the API works.
 * 
 * Add this to routers.ts as a test procedure:
 * 
 * testHardcodedSearch: publicProcedure.query(async () => {
 *   return await testHardcodedSeamlessSearch();
 * })
 */

import { searchContacts } from "./seamlessAI";

export async function testHardcodedSeamlessSearch() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  if (!apiKey) {
    return {
      error: "SEAMLESS_AI_API_KEY not set",
      status: "FAILED",
    };
  }

  console.log("\n" + "=".repeat(80));
  console.log("HARD-CODED SEAMLESS.AI SEARCH TEST");
  console.log("=".repeat(80));

  // Test 1: Minimal filter (just titles)
  console.log("\n\n### TEST 1: MINIMAL FILTER (Just Titles) ###\n");

  const minimalFilter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
  };

  console.log("Request Filter:");
  console.log(JSON.stringify(minimalFilter, null, 2));

  try {
    const result1 = await searchContacts(apiKey, minimalFilter, 10);
    console.log("\nResponse:");
    console.log("Total Results:", result1.supplementalData?.totalResults);
    console.log("Data Length:", result1.data?.length || 0);
    console.log("Has Next Token:", !!result1.supplementalData?.nextToken);
    console.log("Error:", (result1 as any).error || "None");

    if (result1.data && result1.data.length > 0) {
      console.log("\n✅ SUCCESS - Got results!");
      console.log("First result:", JSON.stringify(result1.data[0], null, 2));
    } else {
      console.log("\n❌ FAILED - No results returned");
    }
  } catch (error) {
    console.log("\n❌ ERROR:", error);
  }

  // Test 2: With company size
  console.log("\n\n### TEST 2: WITH COMPANY SIZE (2-10 employees) ###\n");

  const withSizeFilter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    companyEmployeeCountMin: 2,
    companyEmployeeCountMax: 10,
  };

  console.log("Request Filter:");
  console.log(JSON.stringify(withSizeFilter, null, 2));

  try {
    const result2 = await searchContacts(apiKey, withSizeFilter, 10);
    console.log("\nResponse:");
    console.log("Total Results:", result2.supplementalData?.totalResults);
    console.log("Data Length:", result2.data?.length || 0);
    console.log("Has Next Token:", !!result2.supplementalData?.nextToken);
    console.log("Error:", (result2 as any).error || "None");

    if (result2.data && result2.data.length > 0) {
      console.log("\n✅ SUCCESS - Got results!");
      console.log("First result:", JSON.stringify(result2.data[0], null, 2));
    } else {
      console.log("\n❌ FAILED - No results returned");
    }
  } catch (error) {
    console.log("\n❌ ERROR:", error);
  }

  // Test 3: With country
  console.log("\n\n### TEST 3: WITH COUNTRY (United States) ###\n");

  const withCountryFilter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    companyEmployeeCountMin: 2,
    companyEmployeeCountMax: 10,
    contactCountry: ["United States"],
  };

  console.log("Request Filter:");
  console.log(JSON.stringify(withCountryFilter, null, 2));

  try {
    const result3 = await searchContacts(apiKey, withCountryFilter, 10);
    console.log("\nResponse:");
    console.log("Total Results:", result3.supplementalData?.totalResults);
    console.log("Data Length:", result3.data?.length || 0);
    console.log("Has Next Token:", !!result3.supplementalData?.nextToken);
    console.log("Error:", (result3 as any).error || "None");

    if (result3.data && result3.data.length > 0) {
      console.log("\n✅ SUCCESS - Got results!");
      console.log("First result:", JSON.stringify(result3.data[0], null, 2));
    } else {
      console.log("\n❌ FAILED - No results returned");
    }
  } catch (error) {
    console.log("\n❌ ERROR:", error);
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80) + "\n");

  return {
    status: "COMPLETE",
    message: "Check server logs for detailed output",
  };
}
