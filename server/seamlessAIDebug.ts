/**
 * Seamless.AI Debug Module
 * 
 * Captures and logs complete API requests/responses for debugging
 * Helps identify why API returns zero results vs UI returns hundreds of thousands
 */

import * as fs from "fs";
import * as path from "path";

interface DebugLog {
  timestamp: string;
  instruction: string;
  parsedFilters: Record<string, unknown>;
  apiRequest: {
    endpoint: string;
    method: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  apiResponse: {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  analysis: {
    totalResults: number | null;
    dataLength: number | null;
    hasNextToken: boolean;
    hasErrors: boolean;
    errorMessage: string | null;
  };
}

const DEBUG_LOG_DIR = path.join(process.cwd(), ".seamless-debug-logs");

// Ensure debug log directory exists
function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_LOG_DIR)) {
    fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
  }
}

export function logSeamlessAIRequest(
  instruction: string,
  parsedFilters: Record<string, unknown>,
  apiRequest: any,
  apiResponse: any
) {
  ensureDebugDir();

  // Extract key fields from response
  const responseBody = apiResponse?.data || apiResponse;
  const analysis = {
    totalResults: responseBody?.supplementalData?.totalResults || null,
    dataLength: responseBody?.data?.length || 0,
    hasNextToken: !!responseBody?.supplementalData?.nextToken,
    hasErrors: !!responseBody?.error || !!responseBody?.errors,
    errorMessage: responseBody?.error?.message || responseBody?.message || null,
  };

  const debugLog: DebugLog = {
    timestamp: new Date().toISOString(),
    instruction,
    parsedFilters,
    apiRequest: {
      endpoint: apiRequest?.url || "/search/contacts",
      method: apiRequest?.method || "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "[REDACTED]",
      },
      body: apiRequest?.data || {},
    },
    apiResponse: {
      status: apiResponse?.status || 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: responseBody,
    },
    analysis,
  };

  // Log to console
  console.log("\n" + "=".repeat(80));
  console.log("SEAMLESS.AI DEBUG LOG");
  console.log("=".repeat(80));
  console.log("\n📝 ORIGINAL INSTRUCTION:");
  console.log(instruction);

  console.log("\n🔄 PARSED FILTERS:");
  console.log(JSON.stringify(parsedFilters, null, 2));

  console.log("\n📤 API REQUEST BODY:");
  console.log(JSON.stringify(debugLog.apiRequest.body, null, 2));

  console.log("\n📥 API RESPONSE:");
  console.log(`Status: ${debugLog.apiResponse.status}`);
  console.log(JSON.stringify(debugLog.apiResponse.body, null, 2));

  console.log("\n📊 ANALYSIS:");
  console.log(`Total Results: ${analysis.totalResults}`);
  console.log(`Data Length: ${analysis.dataLength}`);
  console.log(`Has Next Token: ${analysis.hasNextToken}`);
  console.log(`Has Errors: ${analysis.hasErrors}`);
  if (analysis.errorMessage) {
    console.log(`Error Message: ${analysis.errorMessage}`);
  }
  console.log("=".repeat(80) + "\n");

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `seamless-debug-${timestamp}.json`;
  const filepath = path.join(DEBUG_LOG_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(debugLog, null, 2));
  console.log(`📁 Debug log saved to: ${filepath}`);

  return debugLog;
}

/**
 * Hard-coded test search with known-good filters
 * Use this to verify the API works with properly formatted filters
 */
export function getHardCodedTestFilters() {
  return {
    // Test 1: Very broad search (should return millions)
    broad: {
      jobTitle: ["CEO", "Founder", "Owner", "President"],
      // No location restriction
      // No company size restriction
    },

    // Test 2: Specific to US only
    usOnly: {
      jobTitle: ["CEO", "Founder", "Owner", "President"],
      contactCountry: ["United States"],
    },

    // Test 3: Small business owners, US, 2-10 employees
    smallBusiness: {
      jobTitle: ["Owner", "Founder", "CEO", "President", "Managing Director"],
      contactCountry: ["United States"],
      companyEmployeeCountMin: 2,
      companyEmployeeCountMax: 10,
    },

    // Test 4: Single title only
    singleTitle: {
      jobTitle: ["CEO"],
      contactCountry: ["United States"],
    },

    // Test 5: No filters at all (should return error or huge number)
    noFilters: {},
  };
}

/**
 * Compare what our parser generates vs expected format
 */
export function compareParserOutput(
  instruction: string,
  parsedFilters: Record<string, unknown>,
  expectedFormat: Record<string, unknown>
) {
  console.log("\n" + "=".repeat(80));
  console.log("PARSER OUTPUT COMPARISON");
  console.log("=".repeat(80));

  console.log("\n📝 INSTRUCTION:");
  console.log(instruction);

  console.log("\n🔍 PARSED OUTPUT:");
  console.log(JSON.stringify(parsedFilters, null, 2));

  console.log("\n✅ EXPECTED FORMAT:");
  console.log(JSON.stringify(expectedFormat, null, 2));

  // Analyze differences
  const differences: string[] = [];

  // Check for missing fields
  for (const [key, value] of Object.entries(expectedFormat)) {
    if (!(key in parsedFilters)) {
      differences.push(`❌ Missing field: ${key}`);
    } else if (JSON.stringify(parsedFilters[key]) !== JSON.stringify(value)) {
      differences.push(
        `⚠️  Field mismatch: ${key}\n   Expected: ${JSON.stringify(value)}\n   Got: ${JSON.stringify(parsedFilters[key])}`
      );
    }
  }

  // Check for extra fields
  for (const key of Object.keys(parsedFilters)) {
    if (!(key in expectedFormat)) {
      differences.push(`ℹ️  Extra field: ${key} = ${JSON.stringify(parsedFilters[key])}`);
    }
  }

  if (differences.length === 0) {
    console.log("\n✅ PERFECT MATCH - No differences found!");
  } else {
    console.log("\n⚠️  DIFFERENCES FOUND:");
    differences.forEach((diff) => console.log(diff));
  }

  console.log("=".repeat(80) + "\n");

  return differences;
}

/**
 * Verify company size format
 */
export function verifyCompanySizeFormat(
  minEmployees: number,
  maxEmployees: number
) {
  console.log("\n" + "=".repeat(80));
  console.log("COMPANY SIZE FORMAT VERIFICATION");
  console.log("=".repeat(80));

  console.log(`\nInput: min=${minEmployees}, max=${maxEmployees}`);

  // Test different formats
  const formats = {
    "numeric range": {
      companyEmployeeCountMin: minEmployees,
      companyEmployeeCountMax: maxEmployees,
    },
    "string range": {
      companySize: `${minEmployees}-${maxEmployees}`,
    },
    "enum format": {
      companySizeEnum: `employees_${minEmployees}_${maxEmployees}`,
    },
    "array format": {
      companySizes: [minEmployees, maxEmployees],
    },
  };

  console.log("\nTested formats:");
  Object.entries(formats).forEach(([name, format]) => {
    console.log(`\n${name}:`);
    console.log(JSON.stringify(format, null, 2));
  });

  console.log("\n✅ RECOMMENDATION: Use numeric range format");
  console.log(JSON.stringify(formats["numeric range"], null, 2));

  console.log("=".repeat(80) + "\n");
}

/**
 * Verify title expansion
 */
export function verifyTitleExpansion(originalTitle: string, expandedTitles: string[]) {
  console.log("\n" + "=".repeat(80));
  console.log("TITLE EXPANSION VERIFICATION");
  console.log("=".repeat(80));

  console.log(`\nOriginal: "${originalTitle}"`);
  console.log(`\nExpanded to ${expandedTitles.length} titles:`);
  expandedTitles.forEach((title, i) => {
    console.log(`  ${i + 1}. ${title}`);
  });

  // Check for common issues
  const issues: string[] = [];

  if (expandedTitles.length === 0) {
    issues.push("❌ No titles generated - expansion failed");
  }

  if (expandedTitles.length === 1 && expandedTitles[0] === originalTitle) {
    issues.push("⚠️  Only original title returned - no expansion happened");
  }

  if (expandedTitles.some((t) => t.toLowerCase() !== t)) {
    issues.push("⚠️  Mixed case titles - consider normalizing");
  }

  if (issues.length > 0) {
    console.log("\n⚠️  ISSUES FOUND:");
    issues.forEach((issue) => console.log(issue));
  } else {
    console.log("\n✅ Title expansion looks good!");
  }

  console.log("=".repeat(80) + "\n");
}

/**
 * Get all debug logs
 */
export function getAllDebugLogs(): DebugLog[] {
  ensureDebugDir();

  const files = fs.readdirSync(DEBUG_LOG_DIR).filter((f) => f.startsWith("seamless-debug-"));

  return files
    .map((file) => {
      try {
        const content = fs.readFileSync(path.join(DEBUG_LOG_DIR, file), "utf-8");
        return JSON.parse(content) as DebugLog;
      } catch (error) {
        console.error(`Failed to read debug log ${file}:`, error);
        return null;
      }
    })
    .filter((log): log is DebugLog => log !== null);
}

/**
 * Clear old debug logs (keep only last 10)
 */
export function cleanupDebugLogs() {
  ensureDebugDir();

  const files = fs.readdirSync(DEBUG_LOG_DIR)
    .filter((f) => f.startsWith("seamless-debug-"))
    .sort()
    .reverse();

  // Keep only last 10
  files.slice(10).forEach((file) => {
    fs.unlinkSync(path.join(DEBUG_LOG_DIR, file));
  });
}
