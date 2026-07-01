/**
 * Seamless.AI Error Logger
 * Captures and formats detailed error information for debugging
 */

export interface SeamlessErrorDetails {
  step: "Search" | "Research" | "Poll" | "Database" | "Unknown";
  endpoint: string;
  method: "GET" | "POST";
  statusCode?: number;
  requestBody?: Record<string, any>;
  responseBody?: string;
  error?: string;
  stackTrace?: string;
  timestamp: string;
}

export function createSeamlessError(details: SeamlessErrorDetails): Error {
  const errorMessage = formatErrorMessage(details);
  const error = new Error(errorMessage);
  error.cause = details;
  return error;
}

export function formatErrorMessage(details: SeamlessErrorDetails): string {
  return `
[SEAMLESS.AI ERROR - ${details.step}]
Endpoint: ${details.method} ${details.endpoint}
Status: ${details.statusCode || "N/A"}
Time: ${details.timestamp}

Request Body: ${details.requestBody ? JSON.stringify(details.requestBody, null, 2) : "N/A"}

Response Body: ${details.responseBody || "N/A"}

Error: ${details.error || "Unknown error"}

Stack Trace: ${details.stackTrace || "N/A"}
`;
}

export function logSeamlessError(details: SeamlessErrorDetails): void {
  console.error(formatErrorMessage(details));
}
