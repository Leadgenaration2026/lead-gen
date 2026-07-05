import { parseInstructionToFilters } from "./server/seamlessAI";

const instruction = "Generate leads for small business owners with company size 2-10";
const filters = parseInstructionToFilters(instruction);

console.log("=== EXACT QUERY TEST ===");
console.log("Instruction:", instruction);
console.log("\nGenerated Filters:");
console.log(JSON.stringify(filters, null, 2));

// Check what the API will receive
console.log("\n=== API REQUEST BODY ===");
const body: Record<string, any> = {};
if (filters.jobTitle?.length) body.jobTitle = filters.jobTitle;
if (filters.companyEmployeeCountMin !== undefined) body.companyEmployeeCountMin = filters.companyEmployeeCountMin;
if (filters.companyEmployeeCountMax !== undefined) body.companyEmployeeCountMax = filters.companyEmployeeCountMax;
if (filters.industryName?.length) body.industryName = filters.industryName;
if (filters.contactCountry?.length) body.contactCountry = filters.contactCountry;

console.log(JSON.stringify(body, null, 2));
