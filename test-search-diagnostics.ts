/**
 * Search Diagnostics Test Script
 * 
 * Run with: npx tsx test-search-diagnostics.ts "your search query"
 * 
 * This will output:
 * 1. Exactly what you typed
 * 2. Parsed filters from parseInstructionToFilters
 * 3. Final request body sent to API
 * 4. API response (totalResults, data.length, etc.)
 * 5. Hard-coded comparison if zero results
 * 6. Field-by-field diff
 */

import { logSearchDiagnostics } from "./server/searchDiagnostics";

async function main() {
  const userQuery = process.argv[2] || "Generate leads for small business owners with company size 2-10";
  const apiKey = process.env.SEAMLESS_AI_API_KEY;

  if (!apiKey) {
    console.error("❌ SEAMLESS_AI_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log("\n🚀 Starting Search Diagnostics Test\n");
  console.log(`📝 Query: "${userQuery}"\n`);

  try {
    const diagnostics = await logSearchDiagnostics(apiKey, userQuery);

    // Print summary for easy reference
    console.log("\n" + "=".repeat(80));
    console.log("📋 QUICK SUMMARY");
    console.log("=".repeat(80));

    console.log("\n✅ PARSED FILTERS:");
    console.log(JSON.stringify(diagnostics.parsedFilters, null, 2));

    console.log("\n✅ FINAL REQUEST BODY:");
    console.log(JSON.stringify(diagnostics.finalRequestBody, null, 2));

    console.log("\n✅ API RESPONSE:");
    console.log(JSON.stringify(diagnostics.responseBody, null, 2));

    if (diagnostics.hardcodedComparison) {
      console.log("\n✅ HARD-CODED COMPARISON:");
      console.log(JSON.stringify(diagnostics.hardcodedComparison, null, 2));
    }

    if (diagnostics.suspiciousFields.length > 0) {
      console.log("\n⚠️  SUSPICIOUS FIELDS:");
      diagnostics.suspiciousFields.forEach((field) => console.log(`   - ${field}`));
    }

    console.log("\n" + "=".repeat(80) + "\n");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
