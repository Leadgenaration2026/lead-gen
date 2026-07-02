import { getDb, createLead, deleteLead } from "./server/db.js";
import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env file
import { appRouter } from "./server/routers.js";
import { createContext } from "./server/_core/context.js";
import { sdk } from "./server/_core/sdk.js";



async function runSingleLeadEnrichmentTest() {
  let leadId: number | undefined;
  let createdLeadId: number | undefined;
  const requestedCount = 1;

  console.log("================================================================================");
  console.log("SINGLE LEAD ENRICHMENT TEST - REDESIGNED WORKFLOW");
  console.log("================================================================================");

  try {
    const db = await getDb();

    if (!db) {
      console.error("Database connection not available. Ensure DATABASE_URL is set.");
      return;
    }
    // Create a new lead for testing
    const newLead = await createLead({
      ownerName: "John Smith",
      companyName: "Google",
      city: "Mountain View",
      state: "California",
      jobTitle: "Software Engineer",
      email: "john.smith@example.com",
      phoneNumber: "123-456-7890",
      userId: 1,
      status: "new",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdLeadId = newLead[0].insertId;
    leadId = createdLeadId;

    const lead = await db.query.leads.findFirst({
      where: (leads, { eq }) => eq(leads.id, leadId!),
    });

    if (!lead) {
      console.error(`Lead with ID ${leadId} not found.`);
      return;
    }

    console.log(`Testing with lead: ${lead.ownerName} (ID: ${lead.id})`);
    console.log(`Requested enrichment for ${requestedCount} lead(s).`);

    // Mock sdk.authenticateRequest to return a mock user
    sdk.authenticateRequest = async (req: any) => {
      return { id: 1, openId: "mock-user", name: "Mock User", email: "mock@example.com", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    };
    const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
    const result = await caller.seamlessAIEnrichment.enrichSelectedLeads({
      leadIds: [lead.id],
      requestedExtraction: requestedCount,
    });

    console.log("\n================================================================================");
    console.log("ENRICHMENT REPORT");
    console.log("================================================================================");
    console.log(JSON.stringify(result, null, 2));

    // Verify database update
    const updatedLead = await db.query.leads.findFirst({
      where: (leads, { eq }) => eq(leads.id, leadId!),
    });

    console.log("\n================================================================================");
    console.log("DATABASE VERIFICATION");
    console.log("================================================================================");
    console.log(`Lead ID: ${updatedLead?.id}`);
    console.log(`Owner Name: ${updatedLead?.ownerName}`);
    console.log(`Phone Number: ${updatedLead?.phoneNumber}`);
    console.log(`Job Title: ${updatedLead?.jobTitle}`);
    console.log(`Company Size: ${updatedLead?.companySize}`);
    console.log(`Email: ${updatedLead?.email}`);
    console.log(`Company: ${updatedLead?.companyName}`);
    console.log(`City: ${updatedLead?.city}`);
    console.log(`State: ${updatedLead?.state}`);
    console.log(`LinkedIn: ${updatedLead?.linkedinUrl}`);

  } catch (error: any) {
    console.error("\n================================================================================");
    console.error("ENRICHMENT TEST FAILED");
    console.error("================================================================================");
    console.error(error.message);
    if (error.data) {
      console.error("Error Data:", JSON.stringify(error.data, null, 2));
    }
    if (error.stack) {
      console.error("Stack Trace:", error.stack);
    }
  } finally {
    if (createdLeadId) {
      console.log(`\nCleaning up: Deleting lead with ID ${createdLeadId}`);
      await deleteLead(createdLeadId);
      console.log(`Lead ${createdLeadId} deleted.`);
    }
  }
}

runSingleLeadEnrichmentTest();
