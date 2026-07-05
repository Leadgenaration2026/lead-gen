/**
 * Search Diagnostics Logger
 * 
 * Captures complete trace of Search request:
 * 1. User Input (exactly what was typed)
 * 2. Parsed Filters (parseInstructionToFilters output)
 * 3. Final Request Body (exact JSON sent to API)
 * 4. HTTP Status & Response
 * 5. Comparison with hard-coded working payload
 * 6. Field-by-field analysis
 */

import { searchContacts } from "./seamlessAI";
import { parseInstructionToFilters } from "./seamlessAI";

interface DiagnosticLog {
  timestamp: string;
  userInput: string;
  parsedFilters: any;
  finalRequestBody: any;
  httpStatus: number;
  responseBody: {
    totalResults?: number;
    supplementalDataTotalResults?: number;
    dataLength: number;
    errors?: any;
    success: boolean;
    nextToken?: string;
  };
  hardcodedComparison?: {
    hardcodedPayload: any;
    hardcodedResults: {
      totalResults?: number;
      dataLength: number;
      success: boolean;
    };
    differences: string[];
  };
  injectedFields?: string[];
  suspiciousFields?: string[];
}

export async function logSearchDiagnostics(
  apiKey: string,
  userInput: string,
  country?: string
): Promise<DiagnosticLog> {
  const log: DiagnosticLog = {
    timestamp: new Date().toISOString(),
    userInput,
    parsedFilters: {},
    finalRequestBody: {},
    httpStatus: 0,
    responseBody: {
      dataLength: 0,
      success: false,
    },
  };

  console.log("\n" + "=".repeat(80));
  console.log("🔍 SEARCH DIAGNOSTICS - COMPLETE TRACE");
  console.log("=".repeat(80));

  // ============================================================================
  // 1. USER INPUT
  // ============================================================================
  console.log("\n📝 USER INPUT (Exactly what was typed):");
  console.log(`   "${userInput}"`);
  log.userInput = userInput;

  // ============================================================================
  // 2. PARSED FILTERS
  // ============================================================================
  console.log("\n🔧 PARSED FILTERS (parseInstructionToFilters output):");
  const parsedFilters = parseInstructionToFilters(userInput, country);
  console.log(JSON.stringify(parsedFilters, null, 2));
  log.parsedFilters = parsedFilters;

  // ============================================================================
  // 3. CHECK FOR INJECTED FIELDS
  // ============================================================================
  console.log("\n⚠️  INJECTED FIELDS CHECK:");
  const injectedFields: string[] = [];
  const suspiciousFields: string[] = [];

  // Fields that should NEVER be auto-injected
  const forbiddenFields = ["industry", "industryName", "revenue", "keywords", "state", "city"];

  for (const field of forbiddenFields) {
    if ((parsedFilters as any)[field]) {
      const value = (parsedFilters as any)[field];
      injectedFields.push(`${field}: ${JSON.stringify(value)}`);
      suspiciousFields.push(field);
    }
  }

  if (injectedFields.length === 0) {
    console.log("   ✅ No suspicious auto-injected fields detected");
  } else {
    console.log("   ❌ SUSPICIOUS FIELDS FOUND:");
    injectedFields.forEach((field) => console.log(`      - ${field}`));
  }
  log.injectedFields = injectedFields;
  log.suspiciousFields = suspiciousFields;

  // ============================================================================
  // 4. FINAL REQUEST BODY
  // ============================================================================
  console.log("\n📤 FINAL REQUEST BODY (Exact JSON sent to POST /search/contacts):");
  const finalRequestBody: Record<string, any> = {};

  // Build exactly what will be sent to the API
  if (parsedFilters.jobTitle?.length) finalRequestBody.jobTitle = parsedFilters.jobTitle;
  if (parsedFilters.companyEmployeeCountMin !== undefined)
    finalRequestBody.companyEmployeeCountMin = parsedFilters.companyEmployeeCountMin;
  if (parsedFilters.companyEmployeeCountMax !== undefined)
    finalRequestBody.companyEmployeeCountMax = parsedFilters.companyEmployeeCountMax;
  if (parsedFilters.industryName?.length) finalRequestBody.industryName = parsedFilters.industryName;
  if (parsedFilters.contactCountry?.length) finalRequestBody.contactCountry = parsedFilters.contactCountry;
  finalRequestBody.limit = 50;

  console.log(JSON.stringify(finalRequestBody, null, 2));
  log.finalRequestBody = finalRequestBody;

  // ============================================================================
  // 5. MAKE API REQUEST
  // ============================================================================
  console.log("\n🚀 MAKING API REQUEST...");
  let response: any;
  let httpStatus = 0;

  try {
    response = await searchContacts(apiKey, finalRequestBody, 50);
    httpStatus = 200;
  } catch (error: any) {
    console.error("   ❌ API Error:", error.message);
    httpStatus = error.statusCode || 500;
    response = { data: [], success: false };
  }

  // ============================================================================
  // 6. HTTP STATUS & RESPONSE
  // ============================================================================
  console.log("\n📊 HTTP STATUS & RESPONSE:");
  console.log(`   HTTP Status: ${httpStatus}`);
  console.log(`   totalResults: ${response.supplementalData?.totalResults || "undefined"}`);
  console.log(`   supplementalData.totalResults: ${response.supplementalData?.totalResults || "undefined"}`);
  console.log(`   data.length: ${response.data?.length || 0}`);
  console.log(`   nextToken: ${response.supplementalData?.nextToken ? "present" : "undefined"}`);
  console.log(`   success: ${response.success || false}`);
  console.log(`   errors: ${response.errors ? JSON.stringify(response.errors) : "none"}`);

  log.httpStatus = httpStatus;
  log.responseBody = {
    totalResults: response.supplementalData?.totalResults,
    supplementalDataTotalResults: response.supplementalData?.totalResults,
    dataLength: response.data?.length || 0,
    errors: (response as any).errors,
    success: (response as any).success || false,
    nextToken: response.supplementalData?.nextToken,
  };

  // ============================================================================
  // 7. IF ZERO RESULTS, RUN HARD-CODED COMPARISON
  // ============================================================================
  if ((response.supplementalData?.totalResults === 0 || response.data?.length === 0) && httpStatus === 200) {
    console.log("\n⚠️  ZERO RESULTS DETECTED - RUNNING HARD-CODED COMPARISON");
    console.log("=".repeat(80));

    const hardcodedPayload = {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      contactCountry: ["United States"],
      limit: 50,
    };

    console.log("\n🔧 HARD-CODED PAYLOAD:");
    console.log(JSON.stringify(hardcodedPayload, null, 2));

    try {
      console.log("\n🚀 MAKING HARD-CODED REQUEST...");
      const hardcodedResponse = await searchContacts(apiKey, hardcodedPayload, 50);

      console.log("\n📊 HARD-CODED RESPONSE:");
      console.log(`   totalResults: ${hardcodedResponse.supplementalData?.totalResults || 0}`);
      console.log(`   data.length: ${hardcodedResponse.data?.length || 0}`);
      console.log(`   success: ${(hardcodedResponse as any).success || false}`);

      // ========================================================================
      // 8. FIELD-BY-FIELD COMPARISON
      // ========================================================================
      console.log("\n🔍 FIELD-BY-FIELD COMPARISON:");
      console.log("=".repeat(80));

      const differences: string[] = [];

      // Compare each field
      const allKeys = new Set([...Object.keys(finalRequestBody), ...Object.keys(hardcodedPayload)]);

      for (const key of allKeys) {
        const userValue = (finalRequestBody as any)[key];
        const hardcodedValue = (hardcodedPayload as any)[key];

        const userValueStr = JSON.stringify(userValue);
        const hardcodedValueStr = JSON.stringify(hardcodedValue);

        if (userValueStr !== hardcodedValueStr) {
          const diff = `${key}: "${userValueStr}" vs "${hardcodedValueStr}"`;
          differences.push(diff);
          console.log(`   ❌ ${diff}`);
        } else {
          console.log(`   ✅ ${key}: MATCH`);
        }
      }

      if (differences.length === 0) {
        console.log("\n   ✅ ALL FIELDS MATCH - Issue is not in request payload");
      } else {
        console.log(`\n   ❌ ${differences.length} FIELD(S) DIFFER`);
      }

      log.hardcodedComparison = {
        hardcodedPayload,
        hardcodedResults: {
          totalResults: hardcodedResponse.supplementalData?.totalResults,
          dataLength: hardcodedResponse.data?.length || 0,
          success: (hardcodedResponse as any).success || false,
        },
        differences,
      };
    } catch (error: any) {
      console.error("   ❌ Hard-coded request failed:", error.message);
    }
  }

  // ============================================================================
  // 9. DIAGNOSIS SUMMARY
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📋 DIAGNOSIS SUMMARY:");
  console.log("=".repeat(80));

  if (suspiciousFields.length > 0) {
    console.log(`\n⚠️  SUSPICIOUS FIELDS DETECTED: ${suspiciousFields.join(", ")}`);
    console.log("   These fields were auto-injected and may not have been requested by the user.");
  }

  if (log.responseBody.dataLength === 0 && log.responseBody.totalResults === 0) {
    console.log("\n❌ ZERO RESULTS: Both totalResults and data.length are 0");
  } else if (log.responseBody.dataLength === 0 && log.responseBody.totalResults && log.responseBody.totalResults > 0) {
    console.log(
      `\n⚠️  PAGINATION BUG SUSPECTED: totalResults=${log.responseBody.totalResults} but data.length=0`
    );
    console.log("   The API found results but didn't return them in this page.");
  } else if (log.responseBody.dataLength > 0) {
    console.log(`\n✅ SUCCESS: Found ${log.responseBody.dataLength} results`);
  }

  console.log("\n" + "=".repeat(80) + "\n");

  return log;
}
