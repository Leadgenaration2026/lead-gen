/**
 * Isolated Filter Tests
 * 
 * Run each test independently to identify which filter field breaks the search.
 * This isolates the problem field by field.
 */

import { searchContacts } from "./seamlessAI";

export async function testIsolatedFilters() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  if (!apiKey) {
    return {
      error: "SEAMLESS_AI_API_KEY not set",
      status: "FAILED",
    };
  }

  console.log("\n" + "=".repeat(80));
  console.log("ISOLATED FILTER TESTS - Find the Breaking Field");
  console.log("=".repeat(80));
  console.log("[DEBUG] API Key loaded:", apiKey.substring(0, 20) + "...");
  console.log("[DEBUG] API Key length:", apiKey.length);

  const results: any = {
    test1: null,
    test2: null,
    test3: null,
    test4: null,
  };

  // TEST 1: Base filters only (titles + country)
  console.log("\n### TEST 1: BASE FILTERS (titles + country) ###\n");
  console.log("Filter:");
  const test1Filter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
  };
  console.log(JSON.stringify(test1Filter, null, 2));

  try {
    const result1 = await searchContacts(apiKey, test1Filter, 10);
    const totalResults1 = (result1 as any).supplementalData?.total || 0;
    results.test1 = totalResults1;
    console.log(`\n✅ Total Results: ${totalResults1}`);
  } catch (error) {
    console.log(`\n❌ ERROR: ${error}`);
    results.test1 = "ERROR";
  }

  // TEST 2: Add company size filters
  console.log("\n\n### TEST 2: ADD COMPANY SIZE FILTERS ###\n");
  console.log("Filter:");
  const test2Filter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
    companyEmployeeCountMin: 2,
    companyEmployeeCountMax: 10,
  };
  console.log(JSON.stringify(test2Filter, null, 2));

  try {
    const result2 = await searchContacts(apiKey, test2Filter, 10);
    const totalResults2 = (result2 as any).supplementalData?.total || 0;
    results.test2 = totalResults2;
    console.log(`\n✅ Total Results: ${totalResults2}`);
  } catch (error) {
    console.log(`\n❌ ERROR: ${error}`);
    results.test2 = "ERROR";
  }

  // TEST 3: Remove company size, add industry
  console.log("\n\n### TEST 3: REMOVE COMPANY SIZE, ADD INDUSTRY ###\n");
  console.log("Filter:");
  const test3Filter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
    industry: ["Technology", "Software"],
  };
  console.log(JSON.stringify(test3Filter, null, 2));

  try {
    const result3 = await searchContacts(apiKey, test3Filter, 10);
    const totalResults3 = (result3 as any).supplementalData?.total || 0;
    results.test3 = totalResults3;
    console.log(`\n✅ Total Results: ${totalResults3}`);
  } catch (error) {
    console.log(`\n❌ ERROR: ${error}`);
    results.test3 = "ERROR";
  }

  // TEST 4: Combine all filters
  console.log("\n\n### TEST 4: COMBINE ALL FILTERS ###\n");
  console.log("Filter:");
  const test4Filter = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
    companyEmployeeCountMin: 2,
    companyEmployeeCountMax: 10,
    industry: ["Technology", "Software"],
  };
  console.log(JSON.stringify(test4Filter, null, 2));

  try {
    const result4 = await searchContacts(apiKey, test4Filter, 10);
    const totalResults4 = (result4 as any).supplementalData?.total || 0;
    results.test4 = totalResults4;
    console.log(`\n✅ Total Results: ${totalResults4}`);
  } catch (error) {
    console.log(`\n❌ ERROR: ${error}`);
    results.test4 = "ERROR";
  }

  // ANALYSIS
  console.log("\n\n" + "=".repeat(80));
  console.log("RESULTS MATRIX");
  console.log("=".repeat(80));

  console.log("\n| Test | Filters | Total Results |");
  console.log("|------|---------|---------------|");
  console.log(`| 1 | titles + country | ${results.test1} |`);
  console.log(`| 2 | + company size | ${results.test2} |`);
  console.log(`| 3 | + industry (no size) | ${results.test3} |`);
  console.log(`| 4 | all filters | ${results.test4} |`);

  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS");
  console.log("=".repeat(80));

  // Determine which field breaks the search
  if (results.test1 > 0 && results.test2 === 0) {
    console.log("\n🚨 PROBLEM IDENTIFIED: Company size filters break the search");
    console.log("   - companyEmployeeCountMin and/or companyEmployeeCountMax are invalid");
    console.log("   - Need to verify correct field names in official API schema");
  } else if (results.test1 > 0 && results.test3 === 0) {
    console.log("\n🚨 PROBLEM IDENTIFIED: Industry filter breaks the search");
    console.log("   - 'industry' field may be invalid or incorrectly formatted");
    console.log("   - Need to verify correct field name in official API schema");
  } else if (results.test1 > 0 && results.test4 === 0) {
    console.log("\n🚨 PROBLEM IDENTIFIED: Combination of filters breaks the search");
    console.log("   - Multiple filters together cause zero results");
    console.log("   - May be a conflict between field names or values");
  } else if (results.test1 === 0) {
    console.log("\n🚨 CRITICAL PROBLEM: Even base filters return zero results");
    console.log("   - This suggests a different issue (API key, endpoint, etc.)");
  } else {
    console.log("\n✅ All tests passed! All filters work correctly");
  }

  console.log("\n" + "=".repeat(80));
  console.log("END OF TESTS");
  console.log("=".repeat(80) + "\n");

  return results;
}
