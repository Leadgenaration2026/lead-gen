/**
 * Enrichment Report Generator
 * Creates detailed summaries of enrichment runs for user feedback
 */

export interface EnrichmentFailure {
  leadId: number;
  leadName: string;
  reason: string;
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

// Map actual stats structure (from seamlessAIEnrichmentRouter) to report format
function mapStatsToReport(stats: any) {
  console.log("=== STATS OBJECT ===");
  console.log(JSON.stringify(stats, null, 2));
  console.log("typeof stats.failures:", typeof stats.failures);
  console.log("Array.isArray(stats.failures):", Array.isArray(stats.failures));
  console.log("typeof stats.errors:", typeof stats.errors);
  console.log("Array.isArray(stats.errors):", Array.isArray(stats.errors));

  // Map errors array to failures array
  const failures: EnrichmentFailure[] = [];
  if (Array.isArray(stats.errors)) {
    for (const error of stats.errors) {
      failures.push({
        leadId: error.leadId || 0,
        leadName: `Lead ${error.leadId}`,
        reason: error.error || "Unknown error",
      });
    }
  }

  return {
    requested: stats.totalLeads || 0,
    successfullyEnriched: stats.enrichedLeads || 0,
    failed: stats.failedLeads || 0,
    creditsUsed: stats.creditsUsed || 0,
    totalProcessingTime:
      stats.endTime && stats.startTime
        ? stats.endTime.getTime() - stats.startTime.getTime()
        : 0,
    startTime: stats.startTime,
    endTime: stats.endTime,
    failures,
  };
}

export function generateEnrichmentReport(stats: any): EnrichmentReport {
  // Map actual stats to report format
  const mapped = mapStatsToReport(stats);

  const successRate =
    mapped.requested > 0
      ? ((mapped.successfullyEnriched / mapped.requested) * 100).toFixed(1)
      : "0.0";

  const avgTimePerLead =
    mapped.successfullyEnriched > 0
      ? (mapped.totalProcessingTime / mapped.successfullyEnriched).toFixed(1)
      : "0.0";

  // Group failures by reason (defensive)
  const failuresByReason: Record<string, number> = {};
  if (Array.isArray(mapped.failures)) {
    for (const failure of mapped.failures) {
      const reason = failure.reason || "Unknown";
      failuresByReason[reason] = (failuresByReason[reason] || 0) + 1;
    }
  }

  return {
    summary: {
      requested: mapped.requested,
      successfullyEnriched: mapped.successfullyEnriched,
      failed: mapped.failed,
      successRate: `${successRate}%`,
    },
    performance: {
      creditsUsed: mapped.creditsUsed,
      totalProcessingTime: formatDuration(mapped.totalProcessingTime),
      averageTimePerLead: `${avgTimePerLead}ms`,
    },
    failures: {
      count: Array.isArray(mapped.failures) ? mapped.failures.length : 0,
      byReason: failuresByReason,
      details: Array.isArray(mapped.failures) ? mapped.failures : [],
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
    const reasonEntries = Object.entries(report.failures.byReason);
    if (Array.isArray(reasonEntries)) {
      for (const [reason, count] of reasonEntries) {
        output += `  - ${reason}: ${count}\n`;
      }
    }

    const failureDetails = Array.isArray(report.failures.details)
      ? report.failures.details
      : [];
    if (failureDetails.length > 0) {
      output += "\nFailed Leads:\n";
      const failureSlice = failureDetails.slice(0, 10);
      for (const failure of failureSlice) {
        output += `  - ${failure.leadName} (ID: ${failure.leadId}): ${failure.reason}\n`;
      }
      if (failureDetails.length > 10) {
        output += `  ... and ${failureDetails.length - 10} more\n`;
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
