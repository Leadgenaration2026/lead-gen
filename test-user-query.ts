import { searchContacts } from "./server/seamlessAI";
import { parseInstructionToFilters } from "./server/seamlessAI";

const apiKey = process.env.SEAMLESS_AI_API_KEY;
if (!apiKey) {
  console.error("❌ SEAMLESS_AI_API_KEY not set");
  process.exit(1);
}

async function testUserQuery() {
  const instruction = "Generate leads for small business owners with company size 2-10";
  console.log("🔍 Testing user query:", instruction);
  
  const filters = parseInstructionToFilters(instruction);
  console.log("\n✅ Generated filters:");
  console.log(JSON.stringify(filters, null, 2));
  
  try {
    console.log("\n🚀 Calling Seamless.AI API...");
    const response = await searchContacts(apiKey, filters, 10);
    
    console.log("\n✅ API Response:");
    console.log(`Total Results: ${response.supplementalData?.totalResults || 0}`);
    console.log(`Retrieved: ${response.data?.length || 0}`);
    
    if (response.data && response.data.length > 0) {
      console.log("\n✅ SUCCESS! Found leads:");
      response.data.slice(0, 3).forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.name || lead.firstName} ${lead.lastName || ''} - ${lead.jobTitle || lead.title}`);
      });
    } else {
      console.log("\n❌ No leads found");
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
  }
}

testUserQuery();
