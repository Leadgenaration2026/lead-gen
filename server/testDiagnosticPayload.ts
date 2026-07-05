/**
 * Diagnostic Payload Test
 * 
 * Captures exact request/response data to compare hard-coded vs parser-generated filters.
 */

import { searchContacts, parseInstructionToFilters } from "./seamlessAI";

export async function testDiagnosticPayload() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  
  console.log("\n" + "=".repeat(80));
  console.log("DIAGNOSTIC PAYLOAD TEST");
  console.log("=".repeat(80));
  
  // Print environment info
  console.log("\n### ENVIRONMENT INFO ###");
  console.log("process.env.SEAMLESS_AI_API_KEY exists:", !!apiKey);
  console.log("API key length:", apiKey?.length || 0);
  console.log("First 8 characters:", apiKey?.substring(0, 8) || "N/A");
  
  if (!apiKey) {
    console.log("\n❌ CRITICAL: API key not found in environment!");
    return {
      error: "API key not set",
      apiKeyExists: false,
    };
  }

  console.log("\n### TEST: Hard-Coded Filters (Known to Work) ###");
  const hardCodedFilters = {
    jobTitle: ["Owner", "Founder", "CEO", "President"],
    contactCountry: ["United States"],
  };
  
  console.log("Request body:");
  console.log(JSON.stringify(hardCodedFilters, null, 2));
  
  try {
    const result1 = await searchContacts(apiKey, hardCodedFilters, 10);
    console.log("\nResponse Status: 200 (OK)");
    console.log("Total Results:", (result1 as any).supplementalData?.total || 0);
    console.log("Data Length:", result1.data?.length || 0);
  } catch (error) {
    console.log("\nResponse Status: ERROR");
    console.log("Error:", error);
  }

  console.log("\n\n### TEST: Parser-Generated Filters ###");
  const instruction = "small business owners company size 2-10";
  console.log(`Instruction: "${instruction}"`);
  const parserFilters = parseInstructionToFilters(instruction, "United States");
  
  console.log("Request body:");
  console.log(JSON.stringify(parserFilters, null, 2));
  
  try {
    const result2 = await searchContacts(apiKey, parserFilters, 10);
    console.log("\nResponse Status: 200 (OK)");
    console.log("Total Results:", (result2 as any).supplementalData?.total || 0);
    console.log("Data Length:", result2.data?.length || 0);
  } catch (error) {
    console.log("\nResponse Status: ERROR");
    console.log("Error:", error);
  }

  console.log("\n\n### COMPARISON ###");
  console.log("Hard-coded filters: jobTitle + contactCountry");
  console.log("Parser filters:", Object.keys(parserFilters).join(" + "));
  console.log("\nParser output:", JSON.stringify(parserFilters, null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("END OF DIAGNOSTIC TEST");
  console.log("=".repeat(80) + "\n");

  return {
    status: "COMPLETE",
    apiKeyExists: true,
    apiKeyLength: apiKey.length,
  };
}
