# Lead Gen & Outreach System - TODO

## Core Features

### 1. Lead Generation & Management
- [x] AI-powered lead generation from natural language instructions
- [x] Lead database schema (company name, owner name, phone, email, etc.)
- [x] Lead CRUD operations (create, read, update, delete)
- [x] Lead list view with filtering and search
- [x] Bulk lead import/export

### 2. Email Campaign System
- [x] Campaign creation and management
- [x] Campaign status tracking (draft, active, paused, completed)
- [x] Email template composition with dynamic variables
- [x] AI-powered email personalization
- [x] Campaign analytics and performance metrics

### 3. Email Sending & Tracking
- [x] Email sending via SMTP integration
- [x] Tracking pixel implementation for open detection
- [x] Click tracking with redirect links
- [x] Email delivery status tracking
- [x] Bounce and unsubscribe handling

### 4. Retell.AI Integration
- [x] Retell.AI API key configuration
- [x] Outbound call triggering on email open
- [x] Outbound call triggering on email click
- [x] Call status tracking and logging
- [x] Agent ID and phone number configuration

### 5. Dashboard & UI
- [x] Main dashboard with key metrics
- [x] Lead management dashboard
- [x] Campaign management interface
- [x] Real-time activity feed (opens, clicks, calls)
- [x] Responsive design and elegant styling

### 6. Settings & Configuration
- [x] Retell.AI API key storage
- [x] Agent ID configuration
- [x] Sender phone number configuration
- [x] SMTP credentials configuration
- [x] Email sender address configuration

### 7. Architecture & Infrastructure
- [x] Database schema design
- [x] tRPC procedures for all operations
- [x] Email tracking endpoints
- [x] Retell.AI webhook handling
- [x] Real-time updates (WebSocket or polling)

## Design & Styling
- [x] Elegant color palette selection
- [x] Typography system
- [x] Component library setup
- [x] Responsive layout system
- [x] Micro-interactions and animations

## Testing & Deployment
- [x] Unit tests for critical functions
- [x] Integration tests for email and Retell.AI flows
- [x] End-to-end testing
- [x] Performance optimization
- [x] Security audit


## Advanced Follow-Up System (NEW)

### 8. Follow-Up Email Management
- [x] Follow-up email scheduling (7 emails over 7-day intervals)
- [x] AI-powered weak point analysis for each lead
- [x] Professional email generation based on weak points
- [x] Spam-proof subject line generation
- [x] Email signature management and storage
- [x] Individual email sending per lead
- [x] Bulk follow-up campaign sending
- [x] Email template library with pre-built formats
- [x] Follow-up email tracking (sent, opened, clicked)
- [x] Follow-up email reporting and analytics

### 9. Follow-Up Call Management
- [x] Automatic follow-up call triggering (7 calls if no pickup)
- [x] Call attempt tracking and logging
- [x] Call status reporting (answered, no answer, voicemail)
- [x] Follow-up call scheduling with intervals
- [x] Call outcome recording

### 10. Email Composer & Personalization
- [x] AI email composer with weak point analysis
- [x] Custom email type selection (discovery, value prop, social proof, urgency, etc.)
- [x] Professional email formatting with bullet points
- [x] Dynamic CTA link insertion (Calendly link)
- [x] Signature insertion in all emails
- [x] Email preview before sending
- [x] A/B testing for subject lines

### 11. Reporting & Analytics
- [x] Follow-up email sent/opened/clicked reporting
- [x] Follow-up call attempt tracking
- [x] Lead engagement timeline (initial email → follow-ups → calls)
- [x] Conversion funnel reporting
- [x] Email performance metrics by type
- [x] Call success rate tracking
- [x] Export reports to CSV

### 12. Settings Enhancement
- [x] Email signature editor and storage
- [x] CTA link configuration
- [x] Follow-up schedule customization
- [x] Email template preferences
- [x] Spam-check settings

## Follow-Up Call Schedule Update
- [x] Update follow-up call schedule: Day 3 (2 calls), Day 6 (2 calls), Day 12 (2 calls), plus initial call = 7 total
- [x] Implement 2 calls per day logic (morning and afternoon)

## Comprehensive Reports Enhancement
- [x] Show all emails sent with status (sent, opened, clicked)
- [x] Show follow-up emails done vs pending per lead
- [x] Show all calls made with status (completed, no answer, pending)
- [x] Show follow-up calls done vs pending per lead
- [x] Per-lead timeline view of all activity

## UI Fixes
- [x] Add "Generate with AI" button to Email Composer that works with manually added leads
- [x] Add Signature management section to Settings page
- [x] Ensure AI email generation includes bullet points, CTA link, and signature

## New Features (Batch 2)
- [x] CSV Import — Upload spreadsheet of leads in bulk with preview dialog
- [x] Email Preview Mode — "Send Test Email to Myself" button in Email Composer
- [x] Lead Tags/Labels — Color-coded tags (Hot, Warm, Cold, Follow Up) with inline selector and filter dropdown
- [x] Lead search by name, company, or email
- [x] CSV format guide on Leads page

## New Features (Batch 3)
- [x] Lead Deduplication — Detect and warn on duplicate leads (same email) during CSV import and manual add
- [x] Lead Deduplication — Show duplicate warning dialog with explicit Skip/Overwrite actions
- [x] Email Scheduling — "Schedule Send" option in Email Composer with date/time picker
- [x] Email Scheduling — Scheduled Emails queue page showing pending/sent/failed statuses
- [x] Email Scheduling — Actual scheduled email processor (cron/heartbeat) that sends due emails
- [x] Campaign Templates — Save campaigns as reusable templates
- [x] Campaign Templates — Template library with preview
- [x] Campaign Templates — Quick-launch from template (opens composer pre-filled with template data)
- [x] Campaign Templates — Create new campaign from template with pre-filled fields

## Batch 4 — Lead Picker & Analytics Dashboard
- [x] Campaign Creation — Multi-select lead picker with search/filter in campaign creation dialog
- [x] Campaign Creation — Show selected lead count and allow removing individual leads
- [x] Campaign Creation — Also add lead picker to the create-campaign-from-template dialog
- [x] Analytics Dashboard — New /analytics page with email performance overview
- [x] Analytics Dashboard — Open rate trends chart (line/area chart over time)
- [x] Analytics Dashboard — Click-through rate chart over time
- [x] Analytics Dashboard — Best-performing templates table with open/click rates
- [x] Analytics Dashboard — Campaign comparison metrics (sent, opened, clicked, called)
- [x] Analytics Dashboard — Add navigation link in sidebar

## Batch 5 — AI Email Writing
- [x] AI Email Writer — Backend tRPC procedure that uses LLM to generate professional, human-sounding, bullet-point emails
- [x] AI Email Writer — Add "AI Write" button to manual EmailComposer page with prompt input
- [x] AI Email Writer — Add "AI Write" button to Campaign Templates creation/editing
- [x] AI Email Writer — Add "AI Write" button to Campaign creation email template field
- [x] AI Email Writer — Generated emails should be professional, concise, bullet-point format with clear CTA
- [x] AI Email Writer — Add CTA link validation/fallback in generateAITemplate post-processing
- [x] AI Email Writer — Add AI Write support to edit-template flow (N/A - no edit flow exists, only create/delete)

## Batch 6 — Claude Integration
- [x] Claude Integration — Install @anthropic-ai/sdk and store ANTHROPIC_API_KEY
- [x] Claude Integration — Create claude.ts helper with optimized prompts for email generation
- [x] Claude Integration — Replace built-in LLM with Claude in generateAITemplate procedure
- [x] Claude Integration — Validate API key works with live test
- [x] Claude Integration — Ensure bullet points and CTA enforcement in post-processing

## Batch 7 — Plain Text Email & Claude Verification
- [x] Claude Output — Change email generation to plain text format (• bullet points, no HTML tags)
- [x] Claude Output — Add "Generated by Claude" indicator in the response/UI
- [x] Claude Output — Update email preview to render plain text properly
- [x] Claude Output — Update EmailComposer/campaign preview UI to preserve plain-text line breaks and bullet points
- [x] Claude Output — Ensure sent emails preserve plain text formatting (newlines → <br> in HTML emails)
- [x] Claude Output — Refactored to shared plainTextToHtml utility with proper <ul><li> wrapping
- [x] Claude Output — Added comprehensive tests for email format conversion (8 tests)

## Batch 8 — Bug Fixes
- [x] Bug Fix — Lead generation giving error message and not generating leads
- [x] Bug Fix — Campaign launch not working (not getting launched)
- [x] Feature — Add delete option for campaigns

## Batch 9 — Lead Selection & Lead Sets
- [x] Feature — Add checkbox/tick selection to each lead row in the leads list
- [x] Feature — Add "Select All" checkbox in the leads table header
- [x] Feature — Create leadSets DB table (id, name, description, userId, createdAt)
- [x] Feature — Add leadSetId column to leads table for grouping
- [x] Feature — Backend CRUD procedures for lead sets (create, list, delete, rename)
- [x] Feature — Assign leads to a lead set (bulk action from selection)
- [x] Feature — Filter leads by lead set in the leads page
- [x] Feature — Allow setting a lead set name when generating leads via AI
- [x] Feature — Allow setting a lead set name when importing CSV leads
- [x] Feature — Bulk action bar appears when leads are selected (Assign to Set)
- [x] Feature — Create new lead set from bulk assign dialog
- [x] Feature — Remove from set option in bulk assign
- [x] Feature — Lead set name shown as badge in leads table

## Batch 10 — Bulk Delete, Lead Set Management & CSV Export
- [x] Feature — Bulk delete button in selection action bar with confirmation dialog
- [x] Feature — Backend bulkDelete procedure for leads
- [x] Feature — Lead Set management page (/lead-sets) with list of all sets
- [x] Feature — Rename lead set inline or via dialog
- [x] Feature — Delete lead set (with option to keep or delete leads)
- [x] Feature — Merge two lead sets into one
- [x] Feature — Show lead count per set on management page
- [x] Feature — CSV export button on leads page filtered by current lead set
- [x] Feature — Add navigation link to Lead Sets management page

## Batch 11 — Bug Fixes (SMTP & Campaign)
- [x] Bug Fix — SMTP settings not saving after entering Gmail credentials
- [x] Bug Fix — Campaign giving error message when launching

## Batch 12 — SMTP Password UX & Test Email
- [x] UX Fix — SMTP password field no longer overwrites saved password when left blank
- [x] UX Fix — Green "Saved" badge next to SMTP Password and Retell API Key when credentials exist
- [x] UX Fix — Password fields only send data to backend when user actually types something new
- [x] Feature — "Send Test Email" button appears after SMTP is configured
- [x] Fix — TypeScript error in sendTestEmail mutation call (to → testEmail field name)

## Batch 13 — Bug Fix (SMTP Password & Retell API Key Not Saving)
- [x] Bug Fix — SMTP password not being saved when user enters it
- [x] Bug Fix — Retell.AI API key not being saved when user enters it

## Batch 14 — Email Signature, Activity Tracking, Retell.AI Calls, Activity Detail View
- [x] Bug Fix — Email signature not being appended to outgoing emails
- [x] Bug Fix — Activity graph not updating when emails are opened/clicked
- [x] Bug Fix — Retell.AI calls not triggering on email open/click events
- [x] Feature — Activity view shows full lead details (name, email, phone number)
- [x] Feature — Activity view shows which link was clicked
- [x] Feature — Activity view shows whether client received a call or not

## Batch 15 — Email Template Enhancement, Retell.AI Fix, Activity Schedule
- [x] Bug Fix — Retell.AI call not triggering when email is opened
- [x] Bug Fix — Email signature still not reflecting in sent emails
- [x] Feature — Email template adds small icons for better presentation
- [x] Feature — Industry field auto-fills in email template
- [x] Feature — CTA link added to all emails: "30 Min Free Consultation" with booking link
- [x] Feature — Bold unique selling points in email body
- [x] Feature — Activity section shows next 7 follow-up emails with date and time
- [x] Feature — Activity section shows next 7 scheduled calls with date and time

## Batch 16 — Follow-Up Schedule, Signature Fix, Retell.AI Debug
- [x] Feature — 7 follow-up emails auto-generated by Claude and sent automatically
- [x] Feature — Follow-up schedule: 1st 3 emails every 2 days, remaining 4 emails every 5 days after 3rd
- [x] Feature — Retell.AI call triggered after each follow-up email is opened (not just initial email)
- [x] Bug Fix — Retell.AI call not firing on first campaign launch
- [x] Bug Fix — Signature showing incorrect format, must use the exact signature saved in settings

## Batch 17 — Timezone, Signatures, Deliverability, Rotational Emails, Unsubscribe, Reply Handling

- [x] Feature — Add timezone field to leads (auto-detected during generation)
- [x] Feature — Retell.AI calls only between 10 AM - 5 PM lead's local time
- [x] Bug Fix — Signature duplication (Claude adding name + separate signature below)
- [x] Feature — Email deliverability checks with green checkmarks before sending
- [x] Feature — Test email option to review template before campaign sends
- [x] Feature — 5 rotational email addresses (Mon=email1, Tue=email2, etc.)
- [x] Feature — Unsubscribe link in every email, removes lead from campaign
- [x] Feature — Remove lead from campaign when customer replies
- [x] Feature — Reply-to address set to nitin@virtualassistant-group.com
- [x] Feature — Positive response status in activity when customer replies or books

## Batch 18 — Retell.AI Call Fix & Positive Response Logic

- [x] Bug Fix — Retell.AI calls show as "made" but not received (API accepted calls - issue is Retell dashboard phone config)
- [x] Fix — Positive response should ONLY be: Calendly booking confirmed OR email reply to nitin@virtualassistant-group.com
- [x] Fix — Clicking Calendly link alone is NOT a positive response (only actual booking is)
- [x] Feature — Calendly booking webhook endpoint at /api/webhooks/calendly
- [x] Feature — Reply detection webhook endpoint at /api/webhooks/reply
- [x] Feature — Cancel pending follow-ups when lead replies, books, or unsubscribes
- [x] Feature — Cancel pending follow-ups when Retell call is answered
- [x] UI — Amber warning box in Settings for Retell phone number (must be Retell-purchased)
- [x] UI — Relabeled manual response buttons as "Admin Override" with explanatory text
- [x] Tests — Positive response logic tests (9 tests: Calendly click NOT positive, Calendly booking IS positive, reply IS positive, unsubscribe cancels follow-ups)

## Batch 19 — Webhook Integration Status Page

- [x] Feature — Create webhookEvents database table (id, type, source, payload, status, email, campaignLeadId, createdAt)
- [x] Feature — DB helpers for logging and querying webhook events
- [x] Feature — tRPC procedures for listing webhook events and getting webhook stats
- [x] Feature — New "Webhooks" tab in Settings page showing integration status
- [x] Feature — Webhook event log table with type, source email, status, timestamp
- [x] Feature — Status indicators showing last successful event time for each webhook type
- [x] Feature — Webhook URL display with copy-to-clipboard for easy setup
- [x] Feature — Update Calendly and reply webhook handlers to log events to new table
- [x] Tests — Webhook event logging and retrieval tests (155 total tests passing)

## Batch 20 — HMAC Webhook Signature Verification

- [x] Feature — Create HMAC signature verification utility for webhooks
- [x] Feature — Add Calendly webhook signing secret to user settings (DB + UI)
- [x] Feature — Add Retell webhook signing secret to user settings (DB + UI)
- [x] Feature — Verify Calendly webhook signature (Calendly-Webhook-Signature header, SHA-256)
- [x] Feature — Verify Retell webhook signature (x-retell-signature header, SHA-256)
- [x] Feature — Log verification failures as "failed" webhook events with error details
- [x] Feature — Settings UI section for entering/updating webhook signing secrets
- [x] Feature — Show verification status (verified/unverified) in webhook event log
- [x] Tests — HMAC verification logic tests (valid signature, invalid signature, missing secret bypass)

## Batch 21 — Lead Editing, Problem Analysis & Email Revamp

- [x] Feature — Add lead editing (update name, email, phone, company, industry, website, notes)
- [x] Feature — Backend tRPC procedure for updating lead fields
- [x] Feature — Edit lead modal/dialog in the Leads page UI
- [x] Feature — Industry/company problem analysis using AI (identify pain points before email)
- [x] Feature — Store problem analysis results in leadWeakPoints table
- [x] Feature — Show "Analyze Problems" step in campaign email flow
- [x] Feature — Revamp email generation prompt to produce professional format: services intro → industry pain points → solutions with case studies → CTA
- [x] Feature — Ensure unique, varied emails (not repetitive templates) by including company-specific context
- [x] Feature — Human-sounding tone with conversational professional language
- [x] Tests — Lead editing tests
- [x] Tests — Problem analysis and email generation format tests

## Batch 22 — Regenerate Email Button

- [x] Feature — Add "Regenerate" button on email preview to get a different variation without re-entering the prompt

## Batch 23 — Bug Fixes

- [x] Bug — Regenerate Variation button not appearing on email preview after AI generation
- [x] Bug — Lead sets not filtering in campaign creation (all leads showing instead of selected set)
- [x] Bug — Emails not being sent — added detailed SMTP error messages and lead set filter to campaign creation
