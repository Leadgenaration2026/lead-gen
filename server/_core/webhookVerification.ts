import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import * as db from "../db";

/**
 * Webhook Signature Verification Utility
 * 
 * Supports:
 * - Cal.com: Uses `x-cal-signature-256` header with HMAC-SHA256(secret, raw_body)
 *   Also supports legacy Calendly format: `Calendly-Webhook-Signature: t=<timestamp>,v1=<signature>`
 * - Retell.AI: Uses `x-retell-signature` header
 *   Signature = HMAC-SHA256(api_key, raw_body)
 */

export interface VerificationResult {
  verified: boolean;
  error?: string;
  skipped?: boolean; // True if no secret configured (bypass mode)
}

/**
 * Verify Cal.com webhook signature
 * Cal.com sends: x-cal-signature-256 header with HMAC-SHA256(secret, raw_body) as hex
 * Also supports legacy Calendly format: Calendly-Webhook-Signature: t=<timestamp>,v1=<signature>
 */
export function verifyCalcomSignature(
  rawBody: string | Buffer,
  headers: { calcomSignature?: string; calendlySignature?: string },
  signingKey: string
): VerificationResult {
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

  // Try Cal.com format first (x-cal-signature-256)
  if (headers.calcomSignature) {
    try {
      const expectedSignature = crypto
        .createHmac("sha256", signingKey)
        .update(body)
        .digest("hex");

      const providedBuffer = Buffer.from(headers.calcomSignature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (providedBuffer.length !== expectedBuffer.length) {
        return { verified: false, error: "Signature length mismatch" };
      }

      const isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
      if (!isValid) {
        return { verified: false, error: "Cal.com signature verification failed — HMAC mismatch" };
      }

      return { verified: true };
    } catch (err) {
      return { verified: false, error: `Verification error: ${err instanceof Error ? err.message : "Unknown"}` };
    }
  }

  // Fallback: Legacy Calendly format (Calendly-Webhook-Signature: t=<timestamp>,v1=<signature>)
  if (headers.calendlySignature) {
    try {
      const parts = headers.calendlySignature.split(",");
      const timestampPart = parts.find(p => p.startsWith("t="));
      const signaturePart = parts.find(p => p.startsWith("v1="));

      if (!timestampPart || !signaturePart) {
        return { verified: false, error: "Invalid signature header format (expected t=...,v1=...)" };
      }

      const timestamp = timestampPart.slice(2);
      const providedSignature = signaturePart.slice(3);
      const signedPayload = `${timestamp}.${body}`;

      const expectedSignature = crypto
        .createHmac("sha256", signingKey)
        .update(signedPayload)
        .digest("hex");

      const sigBuffer = Buffer.from(providedSignature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (sigBuffer.length !== expectedBuffer.length) {
        return { verified: false, error: "Signature length mismatch" };
      }

      const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
      if (!isValid) {
        return { verified: false, error: "Signature verification failed — HMAC mismatch" };
      }

      const eventTime = parseInt(timestamp, 10) * 1000;
      const tolerance = 5 * 60 * 1000;
      if (Math.abs(Date.now() - eventTime) > tolerance) {
        return { verified: false, error: "Webhook timestamp too old (possible replay attack)" };
      }

      return { verified: true };
    } catch (err) {
      return { verified: false, error: `Verification error: ${err instanceof Error ? err.message : "Unknown"}` };
    }
  }

  return { verified: false, error: "Missing webhook signature header (x-cal-signature-256 or Calendly-Webhook-Signature)" };
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
    calendlySecret: (settings as any)?.calcomWebhookSecret || null,
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
