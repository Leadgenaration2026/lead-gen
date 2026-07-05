import { parseInstructionToFilters } from "./server/titleExpansionMap";
import { searchContacts } from "./server/seamlessAI";

async function test() {
  const instruction = "small business owners with company size 2-10";
  const filters = parseInstructionToFilters(instruction);
  
  console.log("=== SEARCH RESULTS ===");
  const searchResults = await searchContacts(filters, 10);
  console.log("Total results from search:", searchResults.totalResults);
  console.log("Data length:", searchResults.data.length);
  console.log("Sample lead:", searchResults.data[0]);
  
  console.log("\n=== WHAT ENRICHMENT SHOULD RETURN ===");
  console.log({
    totalSearchResults: searchResults.totalResults,
    extracted: searchResults.data.length,
    enrichedLeads: searchResults.data.length,
    failedLeads: 0,
    creditsUsed: 0,
  });
}

test().catch(console.error);
