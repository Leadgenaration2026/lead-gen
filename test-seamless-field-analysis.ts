/**
 * Analyze Seamless.AI API response patterns
 * Answer critical questions about field availability and fallback chains
 */

const SEAMLESS_API_KEY = process.env.SEAMLESS_AI_API_KEY;

if (!SEAMLESS_API_KEY) {
  console.error("❌ SEAMLESS_AI_API_KEY not set");
  process.exit(1);
}

interface FieldAnalysis {
  field: string;
  present: boolean;
  value: any;
  type: string;
}

interface ContactAnalysis {
  contactId: string;
  name: string;
  fields: FieldAnalysis[];
  phoneChain: string[];
  companySizeChain: string[];
}

async function seamlessRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, any>
): Promise<any> {
  const url = `https://api.seamless.ai/api/client/v1${path}`;
  const headers: Record<string, string> = {
    "Token": SEAMLESS_API_KEY,
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function analyzeContact(contact: any): Promise<ContactAnalysis> {
  const analysis: ContactAnalysis = {
    contactId: contact.contactId || "unknown",
    name: contact.fullName || contact.name || "Unknown",
    fields: [],
    phoneChain: [],
    companySizeChain: [],
  };

  // Analyze phone fields
  const phoneFields = [
    "contactPhone1",
    "contactPhone2",
    "contactPhone3",
    "companyPhone1",
    "workPhone",
    "phone",
  ];

  for (const field of phoneFields) {
    const value = (contact as any)[field];
    const present = value !== undefined && value !== null && value !== "";
    analysis.fields.push({
      field,
      present,
      value: present ? value : null,
      type: typeof value,
    });
    if (present) {
      analysis.phoneChain.push(`${field}=${value}`);
    }
  }

  // Analyze company size fields
  const companySizeFields = [
    "companyStaffCountRange",
    "companyStaffCount",
    "employeeCount",
    "employees",
  ];

  for (const field of companySizeFields) {
    const value = (contact as any)[field];
    const present = value !== undefined && value !== null && value !== "";
    analysis.fields.push({
      field,
      present,
      value: present ? value : null,
      type: typeof value,
    });
    if (present) {
      analysis.companySizeChain.push(`${field}=${value}`);
    }
  }

  return analysis;
}

async function main() {
  console.log("🔍 Seamless.AI Field Analysis\n");
  console.log("Testing with multiple contacts to understand field patterns...\n");

  try {
    // Search for multiple contacts
    console.log("📍 Step 1: Searching for contacts...");
    const searchResult = await seamlessRequest("POST", "/search/contacts", {
      jobTitle: ["CEO", "Founder"],
      limit: 5,
    });

    if (!searchResult.data || searchResult.data.length === 0) {
      console.error("❌ No search results found");
      process.exit(1);
    }

    console.log(`✅ Found ${searchResult.data.length} contacts\n`);

    // Submit for research
    console.log("📍 Step 2: Submitting for research...");
    const searchResultIds = searchResult.data.map((r: any) => r.searchResultId);
    const researchResult = await seamlessRequest("POST", "/contacts/research", {
      searchResultIds,
    });

    if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
      console.error("❌ Research submission failed");
      process.exit(1);
    }

    console.log(`✅ Submitted ${researchResult.requestIds.length} requests\n`);

    // Poll for results
    console.log("📍 Step 3: Polling for results (this may take 30-60 seconds)...");
    let pollResults: any[] = [];
    let attempts = 0;
    const maxAttempts = 60;

    while (pollResults.length < researchResult.requestIds.length && attempts < maxAttempts) {
      attempts++;
      const idsParam = researchResult.requestIds.join(",");
      const response = await seamlessRequest(
        "GET",
        `/contacts/research/poll?requestIds=${encodeURIComponent(idsParam)}`
      );

      const results: any[] = Array.isArray(response) ? response : response.data || [response];
      const completed = results.filter(
        (r) => r.status === "done" || r.status === "missing" || r.status === "error"
      );

      if (completed.length > 0) {
        pollResults = completed;
        console.log(`✅ Got ${completed.length} results after ${attempts} attempts\n`);
        break;
      }

      console.log(`   Attempt ${attempts}: ${results.length} results, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (pollResults.length === 0) {
      console.error("❌ Polling timed out");
      process.exit(1);
    }

    // Analyze each contact
    console.log("📊 FIELD ANALYSIS RESULTS\n");
    console.log("=".repeat(80));

    const contactAnalyses: ContactAnalysis[] = [];

    for (let i = 0; i < pollResults.length; i++) {
      const result = pollResults[i];
      if (!result.contact) continue;

      const analysis = await analyzeContact(result.contact);
      contactAnalyses.push(analysis);

      console.log(`\n📌 Contact ${i + 1}: ${analysis.name}`);
      console.log("-".repeat(80));

      // Phone analysis
      console.log("\n🔗 Phone Field Chain:");
      if (analysis.phoneChain.length > 0) {
        analysis.phoneChain.forEach((chain) => console.log(`   ✅ ${chain}`));
      } else {
        console.log("   ❌ NO PHONE FIELDS POPULATED");
      }

      // Company size analysis
      console.log("\n📏 Company Size Field Chain:");
      if (analysis.companySizeChain.length > 0) {
        analysis.companySizeChain.forEach((chain) => console.log(`   ✅ ${chain}`));
      } else {
        console.log("   ❌ NO COMPANY SIZE FIELDS POPULATED");
      }

      // Status field
      const status = (result.contact as any).status || "unknown";
      console.log(`\n⚙️  Status: ${status}`);
    }

    // Summary statistics
    console.log("\n" + "=".repeat(80));
    console.log("\n📈 SUMMARY STATISTICS\n");

    const contactsWithPhone = contactAnalyses.filter((c) => c.phoneChain.length > 0).length;
    const contactsWithCompanySize = contactAnalyses.filter((c) => c.companySizeChain.length > 0).length;

    console.log(`Total contacts analyzed: ${contactAnalyses.length}`);
    console.log(`Contacts with phone data: ${contactsWithPhone}/${contactAnalyses.length} (${Math.round((contactsWithPhone / contactAnalyses.length) * 100)}%)`);
    console.log(`Contacts with company size: ${contactsWithCompanySize}/${contactAnalyses.length} (${Math.round((contactsWithCompanySize / contactAnalyses.length) * 100)}%)`);

    // Analyze phone field distribution
    console.log("\n🔗 Phone Field Distribution:");
    const phoneFieldCounts: Record<string, number> = {};
    for (const analysis of contactAnalyses) {
      for (const chain of analysis.phoneChain) {
        const field = chain.split("=")[0];
        phoneFieldCounts[field] = (phoneFieldCounts[field] || 0) + 1;
      }
    }
    Object.entries(phoneFieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`   ${field}: ${count} contacts (${Math.round((count / contactAnalyses.length) * 100)}%)`);
      });

    // Analyze company size field distribution
    console.log("\n📏 Company Size Field Distribution:");
    const companySizeFieldCounts: Record<string, number> = {};
    for (const analysis of contactAnalyses) {
      for (const chain of analysis.companySizeChain) {
        const field = chain.split("=")[0];
        companySizeFieldCounts[field] = (companySizeFieldCounts[field] || 0) + 1;
      }
    }
    Object.entries(companySizeFieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`   ${field}: ${count} contacts (${Math.round((count / contactAnalyses.length) * 100)}%)`);
      });

    // Recommended extraction logic
    console.log("\n💡 RECOMMENDED EXTRACTION LOGIC\n");
    console.log("Phone extraction (fallback chain):");
    console.log("  phone = contactPhone1 ?? contactPhone2 ?? contactPhone3 ?? companyPhone1 ?? null");
    console.log("\nCompany size extraction (fallback chain):");
    console.log("  companySize = companyStaffCountRange ?? companyStaffCount ?? null");

    console.log("\n✅ Analysis complete!");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
