# Debug Notes - Missing Analyze Problems & Regenerate Button

## Root Cause Analysis

### Issue 1: "Analyze Problems" not visible
The "Analyze Problems" step (Step 1) in the AI Write dialog ONLY appears when `leadId` is passed to `AIWriteButton`. 
- In EmailComposer.tsx line 312: `leadId={selectedLead || undefined}` — this means the user MUST first select a lead from the dropdown BEFORE clicking "AI Write Email"
- If no lead is selected, `leadId` is `undefined`, and the Step 1 section is hidden (line 159: `{leadId && (...)}`
- The user likely clicks "AI Write Email" without selecting a lead first

### Issue 2: "Regenerate Variation" not visible
The Regenerate button appears at line 326-357 with condition: `{showPreview && lastAIPrompt && (...)}` 
- `showPreview` is set to true after generation
- `lastAIPrompt` is set via `onPromptUsed` callback from AIWriteButton
- The button appears NEXT TO the "Email Body" label, which might not be obvious
- Also, if user uses the left-panel "Generate with AI" button, it sets lastAIPrompt at line 90

### Fix Plan
1. Make the "Analyze Problems" step more discoverable - show it even without lead selected (with a message to select lead first)
2. Make the Regenerate button more prominent - move it to a more visible location or make it always visible after generation
3. Add a clear "Select a lead first" prompt in the AI Write dialog when no lead is selected
