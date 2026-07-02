/**
 * Enrichment Report Generator
 * Creates detailed summaries of enrichment runs for user feedback
 */

export interface EnrichmentFailure {
  leadId: number;
  leadName: string;
  reason: string;
}

export interface EnrichmentReportStats {
  requested: number;
  successfullyEnriched: number;
  failed: number;
  creditsUsed: number;
  totalProcessingTime: number; // milliseconds
  startTime: Date;
  endTime: Date;
  failures: EnrichmentFailure[];
}

export interface EnrichmentReport {
  summary: {
    requested: number;
    successfullyEnriched: number;
    failed: number;
    successRate: string;
  };
  performance: {
    creditsUsed: number;
    totalProcessingTime: string;
    averageTimePerLead: string;
  };
  failures: {
    count: number;
    byReason: Record<string, number>;
    details: EnrichmentFailure[];
  };
  timestamp: string;
}

export function generateEnrichmentReport(stats: EnrichmentReportStats): EnrichmentReport {
  const successRate = stats.requested > 0 
    ? ((stats.successfullyEnriched / stats.requested) * 100).toFixed(1)
    : "0.0";

  const avgTimePerLead = stats.successfullyEnriched > 0
    ? (stats.totalProcessingTime / stats.successfullyEnriched).toFixed(1)
    : "0.0";

  // Group failures by reason
  const failuresByReason: Record<string, number> = {};
  for (const failure of stats.failures) {
    failuresByReason[failure.reason] = (failuresByReason[failure.reason] || 0) + 1;
  }

  return {
    summary: {
      requested: stats.requested,
      successfullyEnriched: stats.successfullyEnriched,
      failed: stats.failed,
      successRate: `${successRate}%`,
    },
    performance: {
      creditsUsed: stats.creditsUsed,
      totalProcessingTime: formatDuration(stats.totalProcessingTime),
      averageTimePerLead: `${avgTimePerLead}ms`,
    },
    failures: {
      count: stats.failures.length,
      byReason: failuresByReason,
      details: stats.failures,
    },
    timestamp: new Date().toISOString(),
  };
}

export function formatEnrichmentReport(report: EnrichmentReport): string {
  let output = "\n" + "=".repeat(80) + "\n";
  output += "ENRICHMENT SUMMARY\n";
  output += "=".repeat(80) + "\n\n";

  output += "RESULTS\n";
  output += "-".repeat(40) + "\n";
  output += `Requested:               ${report.summary.requested}\n`;
  output += `Successfully Enriched:   ${report.summary.successfullyEnriched}\n`;
  output += `Failed:                  ${report.summary.failed}\n`;
  output += `Success Rate:            ${report.summary.successRate}\n\n`;

  output += "PERFORMANCE\n";
  output += "-".repeat(40) + "\n";
  output += `Credits Used:            ${report.performance.creditsUsed}\n`;
  output += `Total Time:              ${report.performance.totalProcessingTime}\n`;
  output += `Avg Time per Lead:       ${report.performance.averageTimePerLead}\n\n`;

  if (report.failures.count > 0) {
    output += "FAILURES\n";
    output += "-".repeat(40) + "\n";
    output += `Total Failed:            ${report.failures.count}\n\n`;

    output += "Failure Breakdown:\n";
    for (const [reason, count] of Object.entries(report.failures.byReason)) {
      output += `  - ${reason}: ${count}\n`;
    }

    if (report.failures.details.length > 0) {
      output += "\nFailed Leads:\n";
      for (const failure of report.failures.details.slice(0, 10)) {
        output += `  - ${failure.leadName} (ID: ${failure.leadId}): ${failure.reason}\n`;
      }
      if (report.failures.details.length > 10) {
        output += `  ... and ${report.failures.details.length - 10} more\n`;
      }
    }
  }

  output += "\n" + "=".repeat(80) + "\n";
  return output;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
