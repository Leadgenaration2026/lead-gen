import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import * as db from "../db";

/**
 * Webhook Signature Verification Utility
 * 
 * Supports:
 * - Calendly: Uses `Calendly-Webhook-Signature` header with format `t=<timestamp>,v1=<signature>`
 *   Signature = HMAC-SHA256(signing_key, "t.payload")
 * - Retell.AI: Uses `x-retell-signature` header
 *   Signature = HMAC-SHA256(api_key, raw_body)
 */

export interface VerificationResult {
  verified: boolean;
  error?: string;
  skipped?: boolean; // True if no secret configured (bypass mode)
}

/**
 * Verify Calendly webhook signature
 * Calendly sends: Calendly-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>
 * The signed content is: "<timestamp>.<raw_body>"
 */
export function verifyCalendlySignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  signingKey: string
): VerificationResult {
  if (!signatureHeader) {
    return { verified: false, error: "Missing Calendly-Webhook-Signature header" };
  }

  try {
    // Parse the header: t=<timestamp>,v1=<signature>
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find(p => p.startsWith("t="));
    const signaturePart = parts.find(p => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      return { verified: false, error: "Invalid signature header format (expected t=...,v1=...)" };
    }

    const timestamp = timestampPart.slice(2); // Remove "t="
    const providedSignature = signaturePart.slice(3); // Remove "v1="

    // Compute expected signature: HMAC-SHA256(key, "timestamp.body")
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const signedPayload = `${timestamp}.${body}`;
    
    const expectedSignature = crypto
      .createHmac("sha256", signingKey)
      .update(signedPayload)
      .digest("hex");

    // Timing-safe comparison
    const sigBuffer = Buffer.from(providedSignature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return { verified: false, error: "Signature length mismatch" };
    }

    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (!isValid) {
      return { verified: false, error: "Signature verification failed — HMAC mismatch" };
    }

    // Optional: Check timestamp freshness (reject if older than 5 minutes)
    const eventTime = parseInt(timestamp, 10) * 1000; // Convert to ms
    const tolerance = 5 * 60 * 1000; // 5 minutes
    if (Math.abs(Date.now() - eventTime) > tolerance) {
      return { verified: false, error: "Webhook timestamp too old (possible replay attack)" };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, error: `Verification error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

/**
 * Verify Retell.AI webhook signature
 * Retell sends: x-retell-signature header
 * Signature = HMAC-SHA256(api_key, raw_body) as hex
 */
export function verifyRetellSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  apiKey: string
): VerificationResult {
  if (!signatureHeader) {
    return { verified: false, error: "Missing x-retell-signature header" };
  }

  try {
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    
    const expectedSignature = crypto
      .createHmac("sha256", apiKey)
      .update(body)
      .digest("hex");

    // Timing-safe comparison
    const providedBuffer = Buffer.from(signatureHeader, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
      return { verified: false, error: "Signature length mismatch" };
    }

    const isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!isValid) {
      return { verified: false, error: "Signature verification failed — HMAC mismatch" };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, error: `Verification error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

/**
 * Get the webhook signing secrets from user settings
 * Returns null values if not configured (bypass mode)
 */
export async function getWebhookSecrets(): Promise<{
  calendlySecret: string | null;
  retellSecret: string | null;
}> {
  const settings = await db.getUserSettings(1); // Default owner
  return {
    calendlySecret: (settings as any)?.calendlyWebhookSecret || null,
    retellSecret: (settings as any)?.retellWebhookSecret || null,
  };
}

/**
 * Express middleware to capture raw body for signature verification
 * Must be applied BEFORE json body parser on webhook routes
 */
export function captureRawBody(req: Request, _res: Response, next: NextFunction) {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    (req as any).rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch {
      req.body = {};
    }
    next();
  });
}
