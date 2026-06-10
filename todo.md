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

## Batch 24 — Visibility Fixes for Analyze Problems & Regenerate

- [x] Bug — "Analyze Problems" step not visible in AI Write dialog (only shows when lead is pre-selected)
- [x] Bug — "Regenerate Variation" button not visible/prominent after email generation
- [x] Fix — Always show Analyze Problems section in AI Write dialog with clear guidance to select a lead
- [x] Fix — Make Regenerate button more prominent with a dedicated card/section after email is generated
- [x] Fix — Added Email Composer as a tab in the Dashboard for easy access
- [x] Fix — Added Regenerate button to the Campaigns email template creation flow

## Batch 25 — Unified Email Composer (Single + Bulk)

- [x] Feature — Merge Email Composer and Campaigns into one unified tab
- [x] Feature — Add mode toggle: "Single Lead" vs "Bulk Campaign" in Email Composer
- [x] Feature — Single Lead mode: select one lead, analyze problems, generate personalized email, send
- [x] Feature — Bulk Campaign mode: select lead set, generate template with variables, create campaign, launch
- [x] Feature — Keep Regenerate and Analyze Problems accessible in both modes
- [x] Feature — Remove separate Campaigns tab from Dashboard (integrate campaign list into unified view)
- [x] Feature — Campaign history/management section within the unified Email Composer tab

## Batch 26 — Sender Selection & Settings Fixes

- [x] Feature — Add sender account selection dropdown to Email Composer ("Send From" field)
- [x] Feature — Sender dropdown shows primary SMTP account + all rotational email accounts
- [x] Feature — Backend sendIndividual procedure accepts optional senderAccountId parameter
- [x] Feature — When senderAccountId is provided, use that rotational account's SMTP credentials
- [x] Feature — When no senderAccountId, fall back to primary SMTP settings
- [x] Fix — Seamless.ai tab in Settings now properly shows API key configuration content
- [x] Fix — Settings tabs consolidated: SMTP + Rotational merged into "Email Accounts" tab (6 tabs total)

## Batch 27 — Verify SMTP + Rotational Merge on Disk
- [x] Verified SMTP and Rotational content merged into single "Email Accounts" tab on disk
- [x] Verified Seamless.ai TabsContent exists with API key configuration
- [x] Verified 6 matching triggers and TabsContent values (integrations, email, seamless, deliverability, signature, webhooks)
- [x] All 181 tests passing, zero TypeScript errors

## Batch 29 — Fix 3 Reported Issues

- [x] Bug — Seamless.ai API settings page not visible/accessible
- [x] Bug — Lead generation does not have option to choose between AI or Seamless.ai API source
- [x] Bug — Single individual email does not show campaign creation option in the UI
## Batch 30 — Email Personalization & Sender Selection Fixes
- [x] Fix — AI email generation now uses lead's first name in greeting (personalised opening)
- [x] Fix — AI prompt researches industry-specific problems and references company/website
- [x] Fix — Industry name is always included in the generated email (never left blank)
- [x] Fix — Sender account dropdown added to single email composer (choose which email to send from)
- [x] Fix — Single lead email now has optional campaign tracking toggle (not auto-created)
- [x] Fix — sendIndividual backend accepts createCampaign boolean flag
- [x] Fix — Campaign only created when user explicitly enables "Campaign Tracking" toggle
- [x] Fix — All 179 tests passing, zero TypeScript errors
## Batch 31 — Always Create Campaign for Single Lead Emails
- [x] Fix — Remove Campaign Tracking toggle from single lead email composer
- [x] Fix — Always auto-create campaign when sending single lead email (no opt-in needed)
## Batch 32 — Campaign Tracking View & Retell.AI Click Trigger
- [x] Fix — Make campaigns clickable to show detailed tracking (opens, clicks, calls per lead)
- [x] Fix — Campaign detail view shows who opened, who clicked, call status per lead
- [x] Fix — Retell.AI call triggers when client clicks email link
- [x] Feature — Add "View Campaign" link in success toast after sending single email

## Batch 33 — Dedicated Campaign Detail Page
- [x] Create backend procedure for campaign detail with per-lead engagement timeline
- [x] Build CampaignDetail.tsx page with timeline UI per lead
- [x] Register /campaigns/:id route in App.tsx
- [x] Add navigation links from campaigns list to detail page
- [x] Add real-time auto-refresh to campaign detail page (10s polling with live/pause toggle)
- [x] Add campaigns section to home/dashboard page for quick activity checking
- [x] Add Email Deliverability Checks under Email Composer that auto-validates each generated email
- [x] Add AI-powered "Fix Issues" button that rewrites email to resolve failed deliverability checks
- [x] Fix AI email generation: reference company name, make case studies dynamic based on industry/competitors
- [x] Add "Preview as recipient" mode showing how email appears in lead's inbox
- [x] Set up user's signature to auto-append to generated emails in same font style

## Batch — Bulk Campaign Parity with Single Email
- [x] Add Deliverability Checks panel with Fix Issues button to bulk campaign mode
- [x] Ensure bulk campaign AI generation uses personalized company references and dynamic case studies

## Batch — Bulk Campaign Signature & Unsubscribe Fix
- [x] Include signature in bulk campaign AI-generated template (same as single email)
- [x] Fix unsubscribe link visibility in bulk campaign emails
- [x] Fix Name Personalization check — detect greeting patterns and {{ownerName}}/{{firstName}} variables in both single and bulk emails
- [x] Fix Company Reference check — detect company name mentions and {{companyName}} variable in both single and bulk emails
- [x] Fix Unsubscribe Link check for single emails — add unsubscribe opt-out text to single email generation

## Preview as Recipient in Bulk Campaign
- [x] Add "Send Test Email to Myself" / "Preview as Recipient" option to bulk campaign tab (matching single campaign functionality)

## Send Test to All SMTP Accounts
- [x] Add backend procedure to send test email through all configured SMTP accounts simultaneously
- [x] Add UI button in both single and bulk campaign sections

## Bulk Campaign Scheduling
- [x] Add scheduledAt column to campaigns table for scheduled launch time
- [x] Add scheduling UI (date/time picker) to bulk campaign creation form
- [x] Add heartbeat job to auto-launch scheduled campaigns when time arrives
- [x] Show scheduled badge with date/time in campaign history list

## Batch — Social Profiles & Unified Leads Page & Social Outreach

### Social Profile Fields on Leads
- [x] Add website, linkedinUrl, instagramUrl, facebookUrl fields to leads schema
- [x] Update manual lead add form to include social profile fields (all optional)
- [x] Update CSV import to support social profile columns
- [x] Update AI lead generation to extract/generate social profile URLs
- [x] Update lead edit form to include social profile fields

### Unified All Leads Management Page
- [x] Create /all-leads page showing all leads across all sets with status
- [x] Show lead engagement status (emails sent, opened, clicked, called, replied)
- [x] Add inline edit capability for each lead
- [x] Add delete button with confirmation for each lead
- [x] Add bulk actions (delete, assign to set)
- [x] Add filters (by set, by status, by engagement level)
- [x] Add search across all fields
- [x] Add navigation link in sidebar

### Cancel Scheduled Launch
- [x] Add "Cancel Scheduled Launch" button on scheduled (draft) campaigns
- [x] Backend: delete heartbeat job and clear scheduledAt/scheduleCronTaskUid on campaign

### Business Social Profiles in Settings
- [x] Add LinkedIn page/profile URL field to user settings
- [x] Add Instagram page/profile URL field to user settings
- [x] Add Facebook page/profile URL field to user settings
- [x] Add toggle for each: "Page" vs "Personal Profile" type
- [x] Create Social Profiles section in Settings schema (UI pending frontend update)

### Automated Social Outreach System
- [x] Create socialOutreach table (id, campaignLeadId, platform, messageType, message, status, sentAt, etc.)
- [x] Backend procedure to generate short connection request message via Claude (limited characters)
- [x] Backend procedure to generate short follow-up DM via Claude (limited characters)
- [x] Anti-spam safeguards: max 1 message per platform per lead, character limits, daily send limits
- [x] Pre-send checks: verify profile URL exists, verify not already connected, verify within daily limit

### Social Outreach Integration with Follow-Up Flow
- [x] Trigger social outreach after 1st follow-up email if no response (before 2nd follow-up)
- [x] Send LinkedIn connection request + message if linkedinUrl exists
- [x] Send Instagram follow/message if instagramUrl exists
- [x] Send Facebook friend request/message if facebookUrl exists
- [x] Log all social outreach attempts in socialOutreach table
- [x] Show social outreach status in campaign detail and lead timeline

## Batch — Social Outreach UX & Lead Set Fixes
- [x] Add social profile link input fields on Social Outreach page (LinkedIn, Instagram, Facebook URLs)
- [x] Add deliverability/rules checks (green checkmarks) before sending social messages
- [x] Ensure Claude generates the social outreach messages
- [x] Fix lead sets not showing in bulk campaign creation dropdown (verified working - sets show when data exists)
- [x] Make lead set names clickable to navigate to leads page filtered by that set

## Settings — Social Profiles UI
- [x] Add Social Profiles section to Settings page with LinkedIn, Instagram, Facebook URL inputs
- [x] Add page/personal profile type toggle for each social platform
- [x] Wire save to existing settings.update backend procedure

## Social Outreach Analytics
- [x] Add social outreach stats (sent/accepted/pending per platform) to campaign detail page alongside opened/clicked
- [x] Add social outreach summary to the main Analytics page

## Batch — Social Profile Fields in Lead Forms & Sample CSV
- [x] Add website, LinkedIn, Instagram, Facebook URL fields to manual lead add form UI
- [x] Add social profile fields to AI lead generation form/results display
- [x] Add downloadable sample CSV file showing correct data format including social profile columns

## Social Profile Icons in Leads List
- [x] Show clickable social profile icons (LinkedIn, Instagram, Facebook, Website) in the leads list table

## Batch — Settings & Campaign UX Fixes
- [x] Remove Signatures tab from Settings (already in email template)
- [x] Add website and LinkedIn as clickable links in lead details card
- [x] Remove "Test All SMTP Accounts" button from single and bulk campaigns
- [x] Add "Test All SMTP" option in Settings under Rotational Email Addresses section
- [x] Add "Sent from" indicator in bulk campaign showing assigned SMTP account for that day (Mon-Fri rotation)

## Export Leads & Lead Detail Drawer
- [x] Add "Export Leads" button to Leads page that downloads filtered leads as CSV with all fields including social profiles
- [x] Create Lead Detail Drawer/page showing full engagement timeline (emails sent/opened/clicked, calls, social outreach) when clicking a lead row

## Signature Update & Social Media Auth
- [x] Replace generic signature template with Nitin's actual signature in all email generation
- [x] Make website (www.virtualassistant-group.com) and LinkedIn clickable links in signature
- [x] Ensure signature uses same font as email body for both single and bulk campaigns
- [x] Add social media login/authorization UI for LinkedIn, Instagram, Facebook accounts (Account Authorization section in Settings → Social tab with Connect/Reconnect buttons and status badges)

## Website Analysis & Personalized Outreach (SimilarWeb/Ubersuggest Integration)
- [x] Backend: Create website analysis tRPC procedure that fetches traffic, keywords, bounce rate, and traffic sources for a lead's domain
- [x] Backend: Integrate website insights into Claude AI email generation to craft personalized outreach highlighting how VAG can help
- [x] Frontend: Add "Analyze Website" button in Email Composer that pulls insights before generating email
- [x] Frontend: Show website insights panel (traffic, keywords, SEO gaps) in Lead Detail Drawer
- [x] Frontend: Display analysis results with actionable recommendations before email generation
- [x] Testing: Write tests for website analysis procedure and AI integration (7 tests passing)

## Auto-Analyze, Competitor Comparison, News & UX Reorder
- [x] Backend: Auto-run website analysis when new leads are added/generated (store results in DB)
- [x] Backend: Competitor comparison - analyze top competitors and identify what they do better
- [x] Backend: Recent news/industry insights - pull relevant news for email personalization
- [x] Backend: Integrate competitor gaps + news into Claude AI email generation prompt
- [x] Frontend: Reorder Email Composer - Lead selection at top, subject line below email body
- [x] Frontend: Show competitor comparison data in WebsiteInsightsPanel (what competitors have that client lacks)
- [x] Frontend: Show recent news/industry insights in the analysis panel
- [x] Testing: Write tests for competitor comparison and news integration (7 new tests, 193 total passing)

## Fix: Edit Leads, Unsubscribe Link, Clear Campaign, Navigation
- [x] Fix edit leads on Lead Sets page - working edit dialog with all fields
- [x] Fix unsubscribe link to be clickable HTML link (not plain text) in both single and bulk emails
- [x] Unsubscribe link auto-removes lead from follow-up emails when clicked
- [x] Add clear/reset button on bulk campaign page to start fresh
- [x] Add navigation bar on every page for easy navigation between sections

## Social Messaging Workflow Improvements
- [x] Remove misleading "API automation" text from social messaging UI
- [x] Implement one-click copy message + open profile workflow for LinkedIn/Instagram/Facebook
- [x] Create Message Queue page showing all pending social messages
- [x] Add batch actions (copy all, mark as sent) to Message Queue
- [x] Add Message Queue to sidebar navigation
- [x] Backend: Create socialMessages table and procedures for queue management (using existing socialOutreach table)

## Social Message Notification Email
- [x] Add notification email field in Settings Social Media tab
- [x] Backend: Save notification email preference in DB (settings table)
- [x] Backend: Trigger email notification when social message is due after 1st follow-up
- [x] Use notifyOwner or SMTP to send reminder email with message details and profile link

## Retell.AI Dynamic Variables — Pass Customer Context to AI Agent
- [x] Pass customer name (ownerName) to Retell.AI via retell_llm_dynamic_variables when triggering calls
- [x] Pass customer email address to Retell.AI via retell_llm_dynamic_variables when triggering calls
- [x] Pass company name to Retell.AI for additional context during calls
- [x] Update triggerRetellCall function signature to accept lead context data
- [x] Update all call sites (emailTracking.ts open + click triggers, followUpScheduler scheduled calls) to pass lead data
