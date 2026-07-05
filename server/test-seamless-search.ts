/**
 * Test Script: Seamless.AI Search Debugging
 * 
 * Run this to:
 * 1. Test hard-coded filters (known-good format)
 * 2. Compare parser output vs expected format
 * 3. Identify why API returns zero results
 * 
 * Usage: npx ts-node server/test-seamless-search.ts
 */

import { parseInstructionToFilters } from "./seamlessAI";
import { parseSearchInstruction, expandJobTitle } from "./titleExpansionMap";
import {
  getHardCodedTestFilters,
  compareParserOutput,
  verifyCompanySizeFormat,
  verifyTitleExpansion,
} from "./seamlessAIDebug";

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("SEAMLESS.AI SEARCH DEBUGGING TEST");
  console.log("=".repeat(80));

  // Test 1: Verify title expansion
  console.log("\n\n### TEST 1: TITLE EXPANSION ###\n");
  const ownerTitles = expandJobTitle("owner");
  verifyTitleExpansion("owner", ownerTitles);

  // Test 2: Verify company size format
  console.log("\n\n### TEST 2: COMPANY SIZE FORMAT ###\n");
  verifyCompanySizeFormat(2, 10);

  // Test 3: Parse instruction and compare
  console.log("\n\n### TEST 3: PARSER OUTPUT COMPARISON ###\n");
  const instruction = "small business owners with company size 2-10";
  const parsed = parseSearchInstruction(instruction);

  console.log("Parsed Search Instruction:");
  console.log(JSON.stringify(parsed, null, 2));

  // Test 4: Convert to API filters
  console.log("\n\n### TEST 4: INSTRUCTION TO FILTERS ###\n");
  const apiFilters = parseInstructionToFilters(instruction);

  console.log("API Filters Generated:");
  console.log(JSON.stringify(apiFilters, null, 2));

  // Test 5: Compare with hard-coded filters
  console.log("\n\n### TEST 5: HARD-CODED TEST FILTERS ###\n");
  const testFilters = getHardCodedTestFilters();

  console.log("Test Filter 1 (Broad):");
  console.log(JSON.stringify(testFilters.broad, null, 2));

  console.log("\nTest Filter 2 (US Only):");
  console.log(JSON.stringify(testFilters.usOnly, null, 2));

  console.log("\nTest Filter 3 (Small Business):");
  console.log(JSON.stringify(testFilters.smallBusiness, null, 2));

  // Test 6: Compare parser output with expected format
  console.log("\n\n### TEST 6: DIFFERENCES ANALYSIS ###\n");
  const differences = compareParserOutput(
    instruction,
    apiFilters,
    testFilters.smallBusiness
  );

  if (differences.length > 0) {
    console.log("\n⚠️  ISSUES FOUND - These could cause zero results:");
    differences.forEach((diff) => {
      console.log(`  ${diff}`);
    });
  } else {
    console.log("\n✅ Parser output matches expected format!");
  }

  // Test 7: Check for common issues
  console.log("\n\n### TEST 7: COMMON ISSUES CHECKLIST ###\n");

  const issues: string[] = [];

  // Issue 1: Location filter too restrictive
  if (apiFilters.contactCountry && apiFilters.contactCountry.length === 1) {
    if (apiFilters.contactCountry[0] === "United States") {
      console.log("⚠️  Location filter: Restricted to 'United States' only");
      console.log("   This could be correct, but verify against Seamless UI");
    }
  }

  // Issue 2: No job titles
  if (!apiFilters.jobTitle || apiFilters.jobTitle.length === 0) {
    issues.push("❌ No job titles in filter - search will fail");
  }

  // Issue 3: Company size format
  if (
    apiFilters.companyEmployeeCountMin === undefined &&
    apiFilters.companyEmployeeCountMax === undefined
  ) {
    console.log("ℹ️  No company size filter applied");
  } else {
    console.log(
      `✅ Company size filter: ${apiFilters.companyEmployeeCountMin}-${apiFilters.companyEmployeeCountMax}`
    );
  }

  // Issue 4: Empty arrays
  if (apiFilters.jobTitle && apiFilters.jobTitle.length === 0) {
    issues.push("❌ jobTitle array is empty");
  }

  if (issues.length > 0) {
    console.log("\n🚨 CRITICAL ISSUES:");
    issues.forEach((issue) => console.log(`  ${issue}`));
  } else {
    console.log("\n✅ No critical issues detected");
  }

  console.log("\n" + "=".repeat(80));
  console.log("END OF TEST");
  console.log("=".repeat(80) + "\n");
}

main().catch(console.error);
