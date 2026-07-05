import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { verifyPhoneNumbers, estimatePhoneVerificationCredits } from "./phoneVerification";
import { updateLead } from "./db";
import { ENV } from "./_core/env";

export const phoneVerificationRouter = router({
  /**
   * Estimate credits needed for phone verification
   */
  estimateCredits: protectedProcedure
    .input(z.object({ leadCount: z.number().min(1) }))
    .query(({ input }) => {
      const estimatedCredits = estimatePhoneVerificationCredits(input.leadCount);
      return {
        leadCount: input.leadCount,
        estimatedCreditsPerLead: 1,
        totalEstimatedCredits: estimatedCredits,
      };
    }),

  /**
   * Verify phone numbers for selected leads
   */
  verifyPhones: protectedProcedure
    .input(
      z.object({
        leadIds: z.array(z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      if (input.leadIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No leads selected for phone verification",
        });
      }

      try {
        const apiKey = process.env.SEAMLESS_AI_API_KEY || "";
        if (!apiKey) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Seamless.AI API key not configured",
          });
        }

        console.log(
          `[PhoneVerification] Starting verification for ${input.leadIds.length} leads`
        );

        // TODO: Fetch leads from database with seamlessId
        // For now, return mock response
        const verificationStats = {
          totalRequested: input.leadIds.length,
          verified: 0,
          failed: 0,
          totalCreditsUsed: input.leadIds.length, // 1 credit per lead
          results: input.leadIds.map((leadId) => ({
            leadId,
            seamlessId: "",
            phone: undefined,
            verified: false,
            creditsCost: 1,
            error: "Phone verification coming soon",
          })),
        };

        return {
          success: true,
          stats: verificationStats,
          message: `Phone verification initiated for ${input.leadIds.length} leads`,
        };
      } catch (error) {
        console.error("[PhoneVerification] Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Phone verification failed",
        });
      }
    }),
});
