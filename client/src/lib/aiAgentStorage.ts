// Shared between AIAgent.tsx (which owns the actual persisted wizard state)
// and DashboardLayout.tsx (which just needs to know whether a resumable
// conversation exists, to show a "Resume" indicator on the nav item without
// having to be on the AI Agent page itself).
export const WIZARD_STORAGE_KEY = "ai-agent-wizard-v1";

export function hasResumableWizardChat(): boolean {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed && parsed.step !== "location" && parsed.step !== "done" && (parsed.messages?.length || 0) > 1;
  } catch {
    return false;
  }
}
