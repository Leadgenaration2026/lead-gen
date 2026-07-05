/**
 * Search Diagnostics Router
 * Exposes diagnostic logging as a tRPC procedure for the frontend
 */

import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { logSearchDiagnostics } from "./searchDiagnostics";

export const searchDiagnosticsRouter = router({
  /**
   * Trace a search request with complete diagnostics
   * Logs: user input, parsed filters, final request body, API response, hard-coded comparison
   */
  traceSearch: protectedProcedure
    .input(
      z.object({
        userInput: z.string().min(1, "Search query required"),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ input }: { input: { userInput: string; country?: string } }) => {
      const apiKey = process.env.SEAMLESS_AI_API_KEY;
      if (!apiKey) {
        throw new Error("SEAMLESS_AI_API_KEY not configured");
      }

      try {
        const diagnostics = await logSearchDiagnostics(apiKey, input.userInput, input.country);
        return {
          success: true,
          diagnostics,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    }),
});
