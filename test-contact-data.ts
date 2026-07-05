/**
 * Test script to inspect actual contact data from Seamless.AI API
 * Run with: npx tsx test-contact-data.ts
 */

import { searchContacts } from "./server/seamlessAI";

async function main() {
  const apiKey = process.env.SEAMLESS_AI_API_KEY;
  if (!apiKey) {
    console.error("❌ SEAMLESS_AI_API_KEY not set");
    process.exit(1);
  }

  const filters = {
    jobTitle: ["Owner", "Founder", "CEO"],
    companyEmployeeCountMin: 2,
    companyEmployeeCountMax: 10,
    contactCountry: ["United States"],
  };

  console.log("\n🔍 Searching for contacts...\n");
  
  try {
    const response = await searchContacts(apiKey, filters, 5);
    
    console.log("📊 RESPONSE STRUCTURE:");
    console.log(`   - data.length: ${response.data?.length || 0}`);
    console.log(`   - supplementalData.totalResults: ${response.supplementalData?.totalResults}`);
    console.log(`   - nextToken: ${response.supplementalData?.nextToken ? "present" : "absent"}`);
    
    if (response.data && response.data.length > 0) {
      console.log("\n📋 FIRST CONTACT OBJECT:");
      const firstContact = response.data[0];
      console.log(JSON.stringify(firstContact, null, 2));
      
      console.log("\n🔑 AVAILABLE FIELDS:");
      Object.keys(firstContact).forEach(key => {
        const value = (firstContact as any)[key];
        const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
        console.log(`   - ${key}: ${valueStr.substring(0, 60)}${valueStr.length > 60 ? '...' : ''}`);
      });
    } else {
      console.log("\n❌ No contacts returned");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
