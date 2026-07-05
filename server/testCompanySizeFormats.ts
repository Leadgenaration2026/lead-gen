/**
 * Test Different Company Size Field Formats
 * 
 * Systematically tests different field names and formats to find
 * which one the Seamless.AI Search API accepts.
 */

import { searchContacts } from "./seamlessAI";

export async function testCompanySizeFormats() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  if (!apiKey) {
    console.log("❌ API key not found");
    return { error: "API key not set" };
  }

  console.log("\n" + "=".repeat(80));
  console.log("TESTING COMPANY SIZE FIELD FORMATS");
  console.log("=".repeat(80));

  // Base filters that work
  const baseFilters = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
  };

  // Different company size field format variations to test
  const testCases = [
    {
      name: "Test 1: companyEmployeeCountMin/Max (current)",
      filters: {
        ...baseFilters,
        companyEmployeeCountMin: 2,
        companyEmployeeCountMax: 10,
      },
    },
    {
      name: "Test 2: employeeCountMin/Max",
      filters: {
        ...baseFilters,
        employeeCountMin: 2,
        employeeCountMax: 10,
      },
    },
    {
      name: "Test 3: employeeRange (string)",
      filters: {
        ...baseFilters,
        employeeRange: "2-10",
      },
    },
    {
      name: "Test 4: companySize (string)",
      filters: {
        ...baseFilters,
        companySize: "2-10",
      },
    },
    {
      name: "Test 5: companySizeMin/Max",
      filters: {
        ...baseFilters,
        companySizeMin: 2,
        companySizeMax: 10,
      },
    },
    {
      name: "Test 6: staffCountMin/Max",
      filters: {
        ...baseFilters,
        staffCountMin: 2,
        staffCountMax: 10,
      },
    },
    {
      name: "Test 7: headcountMin/Max",
      filters: {
        ...baseFilters,
        headcountMin: 2,
        headcountMax: 10,
      },
    },
    {
      name: "Test 8: No company size (baseline)",
      filters: baseFilters,
    },
  ];

  const results: any[] = [];

  for (const testCase of testCases) {
    console.log(`\n### ${testCase.name} ###`);
    console.log("Filters:", JSON.stringify(testCase.filters, null, 2));

    try {
      const result = await searchContacts(apiKey, testCase.filters, 10);
      const totalResults = (result as any).supplementalData?.total || 0;
      const dataLength = result.data?.length || 0;

      console.log(`✅ Response Status: 200 (OK)`);
      console.log(`Total Results: ${totalResults}`);
      console.log(`Data Length: ${dataLength}`);

      results.push({
        test: testCase.name,
        status: "success",
        totalResults,
        dataLength,
        filters: testCase.filters,
      });
    } catch (error) {
      console.log(`❌ Response Status: ERROR`);
      console.log(`Error:`, error);

      results.push({
        test: testCase.name,
        status: "error",
        error: String(error),
        filters: testCase.filters,
      });
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const successfulTests = results.filter((r) => r.status === "success" && r.totalResults > 0);
  const failedTests = results.filter((r) => r.status === "error" || r.totalResults === 0);

  console.log(`\n✅ SUCCESSFUL TESTS (returned results):`);
  successfulTests.forEach((r) => {
    console.log(`  - ${r.test}: ${r.totalResults} results`);
  });

  if (successfulTests.length === 0) {
    console.log(`  None - all tests returned 0 results or errors`);
  }

  console.log(`\n❌ FAILED TESTS (0 results or error):`);
  failedTests.forEach((r) => {
    console.log(`  - ${r.test}: ${r.status === "error" ? "ERROR" : "0 results"}`);
  });

  console.log("\n" + "=".repeat(80));
  console.log("END OF COMPANY SIZE FORMAT TEST");
  console.log("=".repeat(80) + "\n");

  return {
    status: "COMPLETE",
    totalTests: testCases.length,
    successfulTests: successfulTests.length,
    failedTests: failedTests.length,
    results,
  };
}
