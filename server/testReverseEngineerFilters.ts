import { searchContacts } from "./seamlessAI";

/**
 * Reverse-engineer the correct Seamless.ai API filter format
 * by testing different combinations that the AI Assistant uses
 */

const apiKey = process.env.SEAMLESS_AI_API_KEY;

if (!apiKey) {
  console.error("SEAMLESS_AI_API_KEY not set");
  process.exit(1);
}

interface TestCase {
  name: string;
  filters: Record<string, any>;
  description: string;
}

const testCases: TestCase[] = [
  // Test 1: Basic titles only (known to work)
  {
    name: "Test 1: Titles Only (Baseline - Known to Work)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      contactCountry: ["United States"],
    },
    description: "Should return ~15M results",
  },

  // Test 2: Add industry with different formats
  {
    name: "Test 2: Add Industry (String Array)",
    filters: {
      jobTitle: ["CEO"],
      industry: ["Technology"],
      contactCountry: ["United States"],
    },
    description: "Should return ~1M results if industry format is correct",
  },

  // Test 3: Industry with different casing
  {
    name: "Test 3: Industry (Lowercase)",
    filters: {
      jobTitle: ["CEO"],
      industry: ["technology"],
      contactCountry: ["United States"],
    },
    description: "Test if industry is case-sensitive",
  },

  // Test 4: Industry as single string (not array)
  {
    name: "Test 4: Industry (Single String)",
    filters: {
      jobTitle: ["CEO"],
      industry: "Technology",
      contactCountry: ["United States"],
    },
    description: "Test if industry should be a string instead of array",
  },

  // Test 5: Different industry field name
  {
    name: "Test 5: industryName Field",
    filters: {
      jobTitle: ["CEO"],
      industryName: ["Technology"],
      contactCountry: ["United States"],
    },
    description: "Test if field is called 'industryName'",
  },

  // Test 6: Company size with min/max
  {
    name: "Test 6: Company Size (Min/Max)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      companyEmployeeCountMin: 2,
      companyEmployeeCountMax: 10,
      contactCountry: ["United States"],
    },
    description: "Test current company size format",
  },

  // Test 7: Company size as string range
  {
    name: "Test 7: Company Size (String Range)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      companySize: "2-10",
      contactCountry: ["United States"],
    },
    description: "Test if company size should be a string",
  },

  // Test 8: Company size as enum
  {
    name: "Test 8: Company Size (Enum)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      companySizeEnum: "SMALL_2_10",
      contactCountry: ["United States"],
    },
    description: "Test if company size is an enum value",
  },

  // Test 9: Employee count with different field names
  {
    name: "Test 9: Employee Count (staffCount)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      staffCountMin: 2,
      staffCountMax: 10,
      contactCountry: ["United States"],
    },
    description: "Test if field is 'staffCount' instead of 'companyEmployeeCount'",
  },

  // Test 10: Employee count as headcount
  {
    name: "Test 10: Employee Count (headcount)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      headcountMin: 2,
      headcountMax: 10,
      contactCountry: ["United States"],
    },
    description: "Test if field is 'headcount'",
  },

  // Test 11: All filters combined (industry + company size)
  {
    name: "Test 11: All Filters (Industry + Company Size)",
    filters: {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      industry: ["Technology"],
      companyEmployeeCountMin: 2,
      companyEmployeeCountMax: 10,
      contactCountry: ["United States"],
    },
    description: "Test if all filters work together",
  },

  // Test 12: Country as different format
  {
    name: "Test 12: Country (Different Format)",
    filters: {
      jobTitle: ["CEO"],
      country: "United States",
      contactCountry: ["United States"],
    },
    description: "Test if country field name or format differs",
  },
];

async function runTests() {
  console.log("\n=== SEAMLESS.AI API REVERSE-ENGINEERING TEST ===\n");
  console.log("Testing different filter formats to match AI Assistant behavior\n");

  const results: Array<{
    test: string;
    totalResults: number;
    status: "✅ SUCCESS" | "❌ ZERO" | "⚠️ ERROR";
  }> = [];

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`);
    console.log(`Description: ${testCase.description}`);
    console.log(`Filters: ${JSON.stringify(testCase.filters, null, 2)}`);

    try {
      const response = await searchContacts(apiKey || "", testCase.filters, 1);

      const totalResults = (response as any)?.supplementalData?.totalResults || 0;
      const status =
        totalResults > 0
          ? "✅ SUCCESS"
          : totalResults === 0
            ? "❌ ZERO"
            : "⚠️ ERROR";

      console.log(`Result: ${status} - ${totalResults.toLocaleString()} leads found\n`);

      results.push({
        test: testCase.name,
        totalResults,
        status,
      });
    } catch (error) {
      console.log(`Result: ⚠️ ERROR - ${(error as Error).message}\n`);
      results.push({
        test: testCase.name,
        totalResults: 0,
        status: "⚠️ ERROR",
      });
    }
  }

  // Print summary
  console.log("\n=== TEST SUMMARY ===\n");
  console.log("Test Name | Results | Status");
  console.log("-----------|---------|--------");

  for (const result of results) {
    const shortName = result.test.replace("Test ", "").substring(0, 30);
    console.log(
      `${shortName.padEnd(30)} | ${result.totalResults.toString().padEnd(7)} | ${result.status}`
    );
  }

  // Find successful tests
  const successful = results.filter((r) => r.status === "✅ SUCCESS");
  console.log(`\n✅ Successful formats: ${successful.length}/${testCases.length}`);

  if (successful.length > 0) {
    console.log("\nSuccessful filter formats:");
    successful.forEach((s) => {
      console.log(`  - ${s.test}: ${s.totalResults.toLocaleString()} results`);
    });
  }
}

runTests().catch(console.error);
