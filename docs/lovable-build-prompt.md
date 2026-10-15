# Safe Nest — Lovable build prompt

How to use this file:

1. Paste **Part 1 (Master prompt)** into a new Lovable project as the first message. It sets the
   product, the rules, the data model and the design system, and asks for Phase 1 only.
2. Once Lovable finishes each phase and you have checked it, paste the matching prompt from
   **Part 2 (Phase prompts)**, one at a time. Lovable gets much better results building in steps than
   from one giant "build everything" request.
3. Connect Supabase in Lovable before you start Phase 1 (Lovable → Integrations → Supabase).

---

## Part 1 — Master prompt (paste first)

```
You are building "Safe Nest", a production web application for a UK supported-housing charity
(Safe Nest Housing). It has two halves that share one Supabase backend and one design token palette:

  A. A calm, editorial PUBLIC WEBSITE for people seeking help, professional referrers, funders and
     the public.
  B. A dense, operational STAFF CRM at /crm used by support workers, managers, safeguarding leads,
     housing officers and finance staff to run referrals, residents, properties, rooms, placements,
     support plans, case notes, incidents, tasks, rota, Housing Benefit, invoices, documents,
     governance and audit.

The people in this system can be survivors of domestic abuse, care leavers, refugees, people with
mental-health needs and people who are homeless. A data leak can put someone in physical danger.
Treat confidentiality as the top requirement, above convenience and above visual polish.

Stack: React + Vite + TypeScript + Tailwind + shadcn/ui + React Router + TanStack Query + react-hook-form
+ zod, with Supabase (Postgres, Auth, Storage, Edge Functions, Row Level Security). Locale en-GB,
timezone Europe/London, currency GBP. Dates shown as "14 Oct 2026", times 24-hour.

====================================================================================================
1. NON-NEGOTIABLE SAFETY RULES (apply to every phase)
====================================================================================================

1. Public pages, page titles, meta tags, Open Graph tags, sitemap, search previews and email
   subjects must NEVER contain: refuge or property street addresses, postcodes, room labels or
   numbers, resident names or identities, case-note text, risk details, or safeguarding narratives.
   Public property information is neighbourhood-level only ("Westgate", not a street).
2. The public site reads ONLY from dedicated public views (e.g. `public_services`, `public_properties`,
   `public_news`, `public_settings`) that expose whitelisted columns of published rows. The anon role
   must have NO select access to base tables. Confidential properties (confidential = true) must not
   appear in public views at all.
3. Every table has Row Level Security ON. Every row carries `organisation_id`, and every policy filters
   on the signed-in user's organisation. No policy may use `using (true)` for authenticated users on
   sensitive tables.
4. Protected documents go in a PRIVATE Supabase Storage bucket ("documents"). Never a public bucket,
   never public URLs. Downloads go through short-lived signed URLs (60 seconds) issued by an Edge
   Function after a permission check, and each download is audited.
5. Money is stored as integer minor units (pence) in `*_minor` integer columns. Never floats. Format
   only at display time (£1,234.56).
6. Status changes go through dedicated Postgres functions (RPC, `security definer`, with explicit
   checks) that validate the allowed transition, write a history row and write an audit row in the
   same transaction. The UI never updates a `status` column directly.
7. Finalised case notes are append-only. Once `finalised = true` the note text cannot be updated or
   deleted (enforce with a trigger, not just the UI). Corrections are added as addenda/versions with
   a reason.
8. Security-sensitive changes and views of restricted records write an `audit_log` row: actor, action,
   resource type, resource id, success, timestamp, plus minimal before/after JSON. Audit rows must
   NEVER contain passwords, tokens, full case-note text, document contents, safeguarding narratives
   or Housing Benefit evidence. audit_log is insert-only (no update/delete for anyone).
9. Use clearly fictional data only in seed scripts and tests. No real people, no real addresses.
10. Every public page shows a visible safety strip: "In immediate danger, call 999." plus the
    organisation's configurable confidential support message, and a "Leave this site quickly" button
    that immediately replaces the page with a neutral site (e.g. https://www.bbc.co.uk/weather) using
    window.location.replace so the back button does not return. Also bind the Escape key pressed
    three times to the same action.
11. Validate every form with zod on the client AND re-validate in Postgres (check constraints / RPC
    argument checks) or Edge Functions. Public forms include a hidden honeypot field and rate limiting
    (Edge Function, per IP + per email, e.g. 5 submissions / 10 minutes).
12. No third-party analytics, chat widgets, tracking pixels or embedded maps on the public site.
    Cookies: only strictly necessary ones (auth). The cookie page says so.

====================================================================================================
2. ROLES AND ACCESS (real role-based access, enforced by RLS)
====================================================================================================

Staff accounts are invite-only. There is NO public sign-up. Roles (a user can hold several):

  super_admin              – platform owner; everything
  org_admin                – users, roles, settings, email provider, content, governance, audit
  service_manager          – all operational modules for their services; reports; approve closures
  safeguarding_lead        – all incidents incl. restricted; restricted clients; closure decisions
  support_lead             – referrals, clients, support plans, case notes, tasks, rota for their scope
  support_worker           – their assigned clients/referrals: case notes, support goals, tasks
  property_officer         – properties, rooms, occupancy, voids/maintenance, placements
  finance_officer          – Housing Benefit, invoices, payments, finance reports (NOT case notes)
  content_editor           – public content only (services, properties' public fields, news, settings)
  auditor                  – read-only across modules + audit log; cannot see restricted text

Scope: a membership may be limited to specific services and/or properties (arrays of ids). Empty =
all in the organisation.

Restricted records: clients, referral risks, case notes and incidents can be flagged `restricted`.
Restricted rows are visible only to safeguarding_lead, service_manager, org_admin, or users with an
active row in `restricted_access_assignments` (user, resource_type, resource_id, reason, expires_at).
Others see a placeholder card: "Restricted record — access is limited. Ask a safeguarding lead."
Opening a restricted record writes an audit row.

Implement roles with tables `roles`, `memberships (organisation_id, user_id, role, service_ids uuid[],
property_ids uuid[], active)` and SQL helper functions `current_org_id()`, `has_role(role text)`,
`in_scope(service_id uuid, property_id uuid)`, `can_view_restricted(resource_type text, id uuid)`
used by RLS policies. Hide nav items and buttons the user cannot use, but ALWAYS also enforce on
the server via RLS/RPC.

Auth: Supabase email + password, minimum 12 characters, plus TOTP MFA (Supabase MFA) that an
org_admin can make mandatory (setting `require_mfa`). Session idle timeout 30 minutes with a
2-minute warning dialog; absolute session lifetime 8 hours. Password reset by email. Lock the login
form for 15 minutes after 5 failed attempts for an email. Log every login success/failure to
`login_attempts`. Deactivated users are blocked immediately (RLS checks `memberships.active`).

====================================================================================================
3. DATA MODEL (Supabase Postgres, snake_case, uuid ids, created_at/updated_at timestamptz)
====================================================================================================

Every table below has `organisation_id` unless it is a child table that inherits it via its parent.
Use text + CHECK constraints (or Postgres enums) for the status lists given.

Organisation & access
- organisations: name, slug, timezone (default 'Europe/London')
- profiles: id (= auth.users.id), organisation_id, name, email, job_title, active
- memberships, roles, restricted_access_assignments (see section 2)
- login_attempts: user_id?, email, success, ip_address, created_at
- site_settings: key, value  (unique per org+key). Keys:
  homepage.headline, homepage.stats.moveOn, homepage.stats.newRooms, homepage.stats.responseTarget,
  contact.generalEmail, contact.referralEmail, contact.emergencyMessage, require_mfa
- organisation_secrets: key, secret_cipher (stored via Supabase Vault; NEVER returned to the client;
  the UI shows only "Configured ✓ / Not configured" and a "Replace" action)

Public content
- services: title, slug, summary, content (markdown), audience, referral_routes, eligibility,
  support_model, image_url, display_order, published, seo_title, seo_description
- properties: service_id, public_name, slug, neighbourhood, service_type, public_summary,
  facilities text[], eligibility, capacity int, public_vacancy_state ('Vacancies' | 'Limited' |
  'Waiting list' | 'Not currently taking referrals'), accessibility, confidential bool,
  secure_address (staff-only; never in any public view), published, display_order
- property_images: property_id, storage_key, alt_text (required), sort_order
- news_categories: name, slug   (Announcements, Stories, Reports, Community, Policy)
- news_posts: category_id, title, slug, summary, content (markdown), author_name, featured_image,
  published_at, published, seo_title, seo_description
- team_members: name, role, bio, image_url, display_order, published
- contact_submissions: name, email, phone, category, message, consent, status ('NEW','IN_PROGRESS',
  'CLOSED'), retention_until

Referrals
- referrals: service_id, reference (unique, format SN-R-000123, generated by a sequence), status,
  referrer_name, referrer_organisation, referrer_role, referrer_email, referrer_phone, relationship,
  person_name, person_identifier, age_range, pronouns, contact_details ("safe contact details"),
  current_location, housing_situation, support_needs, known_risks, accessibility_needs,
  funding_route, consent_given, privacy_acknowledged, anonymous_domestic_abuse bool, honeypot,
  follow_up_date
- referral_status_history: referral_id, previous, next, reason, changed_by, created_at
- referral_assignments: referral_id, user_id, created_at (keep history; current = latest)
- referral_notes: referral_id, author_id, note, restricted
- referral_risks: referral_id, category, level ('Low','Medium','High'), summary, restricted (default true)
- referral_documents: referral_id, document_id

Referral statuses and the ONLY allowed transitions (enforce in the RPC `transition_referral`):
  NEW → ACKNOWLEDGED, TRIAGE, WITHDRAWN
  ACKNOWLEDGED → TRIAGE, AWAITING_INFORMATION, WITHDRAWN
  TRIAGE → ASSESSMENT_BOOKED, AWAITING_INFORMATION, SIGNPOSTED, DECLINED, WITHDRAWN
  ASSESSMENT_BOOKED → ASSESSING, AWAITING_INFORMATION, WITHDRAWN
  ASSESSING → ELIGIBLE, AWAITING_INFORMATION, DECLINED, SIGNPOSTED, WITHDRAWN
  AWAITING_INFORMATION → TRIAGE, ASSESSING, DECLINED, WITHDRAWN
  ELIGIBLE → OFFER_MADE, WAITLISTED, SIGNPOSTED, DECLINED
  OFFER_MADE → OFFER_ACCEPTED, WAITLISTED, DECLINED, WITHDRAWN
  OFFER_ACCEPTED → MOVING_IN, WITHDRAWN
  MOVING_IN → PLACED, WITHDRAWN
  PLACED → CLOSED
  WAITLISTED → OFFER_MADE, CLOSED, WITHDRAWN
  DECLINED → CLOSED;  WITHDRAWN → CLOSED;  SIGNPOSTED → CLOSED;  CLOSED → (none)
DECLINED, WITHDRAWN and SIGNPOSTED require a reason. Moving to PLACED offers to create the client
record and placement in one step.

Clients (residents)
- clients: service_id, referral_id (unique, nullable), reference (SN-C-001…), display_name,
  date_of_birth, key_worker_id, phone, email, address, gender, pronouns, admission_date,
  risk_level ('Low','Medium','High'), communication_needs, important_alerts, safeguarding_flag,
  restricted, status ('CURRENT','WAITLIST','MOVED_ON','ARCHIVED')
- related_people: full_name, phone, email, address, notes, preferred_contact_method,
  consent_to_contact
- client_relationships: client_id, related_client_id?, related_person_id? (exactly one of the two),
  relationship_type, inverse_relationship_type, start_date, end_date, notes,
  is_emergency_contact, is_next_of_kin, created_by.
  Relationship types (label → inverse): Mother→Child, Father→Child, Parent→Child, Child→Parent,
  Son→Parent, Daughter→Parent, Sibling↔Sibling, Brother→Sibling, Sister→Sibling,
  Grandparent→Grandchild, Grandchild→Grandparent, Husband→Spouse, Wife→Spouse, Spouse↔Spouse,
  Partner↔Partner, Guardian→Dependant, Carer→Dependant, Dependant→Guardian,
  Other family member↔Other family member, Significant person↔Significant person.
  When two clients are linked, show the inverse relationship on the other client's profile
  automatically. Flag a warning if a linked person is recorded as a known risk.

Properties & placements
- rooms: property_id, label, status ('AVAILABLE','OCCUPIED','OFFERED','VOID','MAINTENANCE'), notes
- placements: client_id, property_id, room_id, status ('ACTIVE','MOVED_OUT','CANCELLED'),
  start_date, end_date, tenancy_ref, ended_reason
- occupancy_records: property_id, room_id, client_id, placement_id, start_date, end_date
  Rules (enforce in RPC `create_placement` / `end_placement`): a room is placeable only when status is
  AVAILABLE and it has no active occupancy; occupancy date ranges for a room must never overlap
  (null end = open-ended); creating a placement sets room → OCCUPIED, ending it sets room →
  VOID (needs turnaround) and closes the occupancy record; ended_reason required.

Support
- support_plans: client_id, version int, status ('ACTIVE','SUPERSEDED','CLOSED'), review_date,
  created_by. Editing an active plan creates a new version and supersedes the old one.
- support_goals: support_plan_id, category (Housing, Money & benefits, Health, Mental health,
  Safety, Education & work, Family & relationships, Independent living, Other), desired_outcome,
  action_steps, owner, target_date, status ('NOT_STARTED','IN_PROGRESS','ACHIEVED','PAUSED','DROPPED')
- support_plan_reviews: support_plan_id, review_date, notes, reviewed_by
- case_notes: client_id, author_id, contact_type (Face to face, Phone, Video, Text/message, Email,
  Home visit, Multi-agency meeting, Attempted contact), category (Key work, Safeguarding, Health,
  Housing, Finance, Tenancy, Family, General), note, outcome, follow_up_action, follow_up_date,
  restricted, finalised. Drafts editable by their author; "Finalise" locks them.
- case_note_versions: case_note_id, author_id, content, reason (addenda/corrections)

Incidents & safeguarding
- incidents: client_id?, reference (SN-I-…), category (Safeguarding concern, Self-harm, Violence or
  aggression, Missing person, Property damage, Medical emergency, Substance use, Anti-social
  behaviour, Domestic abuse, Data breach, Other), severity ('Low','Medium','High','Critical'),
  status ('DRAFT','OPEN','UNDER_REVIEW','EXTERNAL_REFERRAL_MADE','ACTION_PLAN_ACTIVE','MONITORING',
  'CLOSED'), incident_at, location (general area, not an address), description, immediate_action,
  assigned_lead_id, restricted (default true), closure_decision, review_date
- incident_updates: incident_id, author_id, update (append-only)
- incident_actions: incident_id, action, owner, due_date, completed_at
  Closing requires a closure decision, all actions completed (or explicitly waived with reason) and
  a safeguarding_lead or service_manager. High/Critical incidents notify safeguarding leads.

Tasks & rota
- tasks: title, description, priority ('LOW','MEDIUM','HIGH','URGENT'), due_at, status ('OPEN',
  'IN_PROGRESS','DONE','CANCELLED'), assigned_to_id, client_id?, property_id?, referral_id?,
  incident_id?. Overdue = not DONE and due_at < now.
- rota_shifts: property_id?, service_id?, shift_type (Early, Late, Long day, Waking night,
  Sleep-in, On-call, Office), starts_at, ends_at, handover, override_reason
- rota_assignments: shift_id, user_id
  A user may not be assigned to overlapping shifts unless an override_reason is given.

Finance
- funding_sources: name, active
- housing_benefit_claims: client_id, status ('NOT_STARTED','PENDING','EVIDENCE_REQUIRED',
  'SUBMITTED','IN_PAYMENT','SUSPENDED','REJECTED','CLOSED'), submitted_at, evidence_required,
  weekly_rent_minor int, service_charge_minor int, payment_status ('PENDING','IN_PAYMENT','PAUSED',
  'FAILED','CLOSED')
- invoices: reference (SN-INV-…), funding_source_id?, status ('DRAFT','ISSUED','PART_PAID','PAID',
  'VOID','OVERDUE'), total_minor, issued_at, due_at
- invoice_items: invoice_id, description, quantity int, unit_minor int
  total_minor = Σ quantity × unit_minor (computed by trigger, never trusted from the client)
- payments: invoice_id, amount_minor, paid_at, method ('BANK_TRANSFER','DIRECT_DEBIT','CASH','CARD',
  'OTHER'). Remaining = max(0, total − Σ payments). A payment may not exceed the remaining balance.
  Status auto-moves to PART_PAID / PAID. Invoices are editable only in DRAFT; VOID needs a reason.
  Finance users must NOT be able to read case notes, incidents or support plans.

Documents
- documents: client_id?, display_name, storage_key (unique), mime_type, size_bytes, sha256,
  malware_scan_status ('PENDING','CLEAN','INFECTED','SKIPPED'), malware_scanned_at, category
  (ID, Tenancy, Housing Benefit, Support plan, Safeguarding, Medical, Correspondence, Other),
  restricted, expires_at, review_date, uploaded_by
- document_versions: document_id, storage_key, size_bytes, created_at
  Upload rules: max 15 MB; allow pdf, png, jpg, docx, xlsx, txt only; check file signature (magic
  bytes) as well as extension/MIME in an Edge Function; compute SHA-256; store under
  `{org_id}/{uuid}` (never the original filename in the key).

Governance & audit
- audit_log: actor_id, action, resource_type, resource_id, before_json, after_json, success,
  ip_address, created_at (insert-only)
- data_retention_rules: resource_type ('ContactSubmission','Referral','Client','CaseNote',
  'Incident','Document','AuditLog'), retention_days, legal_basis_note (required when active),
  active — unique per org + resource_type
- data_subject_requests: request_type ('ACCESS','RECTIFICATION','ERASURE','RESTRICTION','OBJECTION',
  'PORTABILITY','OTHER'), subject_ref (a reference, not a full name), status ('OPEN','IN_REVIEW',
  'ACTION_REQUIRED','ON_HOLD','COMPLETED','DECLINED'), due_at (default created + 1 calendar month),
  notes, legal_hold, reviewed_by, reviewed_at. A request under legal hold cannot be completed or
  declined until the hold is released as a separate, audited step; closing requires a resolution note.
- data_retention_review_runs: triggered_by, mode ('DRY_RUN'), status, started_at, completed_at,
  summary_json. The review is DRY-RUN ONLY: it counts candidates per rule, excludes legal holds and
  open requests, and NEVER deletes or anonymises anything.
- notifications: user_id, title, body, link, read_at (bodies contain references and next steps
  only, never sensitive detail)

====================================================================================================
4. DESIGN SYSTEM
====================================================================================================

Shared tokens (put in Tailwind theme + CSS variables):
  navy-950 #0f1b2d · navy-900 #152238 · navy-800 #233a60 · navy-700 #2f4d80 · navy-600 #446b9d
  teal-700 #1e5f6c · teal-600 #2e7f8f · teal-500 #4d9da8 · teal-300 #9dd3d9 · teal-100 #e9f5f5
  sand-50 #fbfbf8 (page background) · sand-100 #f4f5f2 · sand-200 #e7ebe8
  ink #21303e (body text) · muted #607080 · line #d7e0e1 (dividers)
  danger #b64049 · warning #a36c17 · success #327c61
  radius 5 / 10 / 18 px · shadow-sm 0 1px 2px rgba(21,34,56,.06) · shadow-md 0 10px 30px rgba(21,34,56,.09)
  Container 1180px. Focus ring: 3px solid teal-500, offset 3px, on every interactive element.

PUBLIC site — editorial and calm:
  warm off-white surface, dark navy text, serif display type (Georgia / a Google serif such as
  "Source Serif 4"), headings weight 400 with slight negative letter-spacing, big clamp() sizes
  (h1 ≈ 2.65–4.8rem), fine 1px dividers, compact controls (buttons 48px tall, 12px bold sans
  uppercase-ish labels), eyebrow labels in teal-700 11px bold uppercase with 0.14em tracking and a
  short rule before them, generous whitespace (sections ~110px vertical padding on desktop).
  Hero: soft teal-to-sand diagonal gradient, image in an arched frame (rounded top corners ~46%).
  No stock "charity" clichés, no carousels, no auto-playing media.

CRM — dense operational shell using the same tokens:
  left sidebar (navy-950) with brand "Safe Nest · Operations", a workspace pill, grouped nav
  "Workspace": Overview, Referrals, Clients, Placements, Properties, Incidents, Tasks, Rota, Billing
  "Manage": Documents, Content, Reports, Users & roles, Governance, Audit log, Settings
  and a footer with user avatar initial, name, role and sign-out. Top bar: breadcrumb, global search,
  notifications bell with unread count, avatar. Content uses metric cards, status badges, filter bars,
  sortable tables with sticky headers and clickable rows, detail pages with tabs, side panels/drawers
  for quick create. Sans-serif (Inter) for CRM body text, 14px base, tight spacing.
  Status badge colours: neutral grey for NEW/DRAFT/NOT_STARTED, teal for in-progress states, green
  for PLACED/PAID/DONE/ACHIEVED/CLOSED-positive, amber for AWAITING_INFORMATION/EVIDENCE_REQUIRED/
  OVERDUE/WAITLISTED, red for DECLINED/REJECTED/FAILED/Critical. Labels are humanised
  ("AWAITING_INFORMATION" → "Awaiting information").
  Tables collapse into stacked cards below 768px. Empty states have a one-line explanation and the
  primary action. Every list has loading skeletons and error states.

Accessibility: WCAG 2.2 AA. Semantic landmarks, skip link, labelled inputs with visible labels,
error summaries at the top of forms linked to fields, 4.5:1 contrast, keyboard-operable dialogs,
prefers-reduced-motion respected, no information by colour alone.

====================================================================================================
5. WHAT TO BUILD NOW — PHASE 1 ONLY
====================================================================================================

Build only Phase 1 in this message. I will send later phases separately. Do not stub later modules
with fake functionality; leave them out of the nav until their phase.

Phase 1 = foundation + public website:
  a) Supabase schema for: organisations, profiles, roles, memberships, login_attempts,
     site_settings, services, properties (incl. secure_address and confidential), property_images,
     news_categories, news_posts, team_members, contact_submissions, referrals (+ status_history),
     audit_log — with RLS on every table, the helper functions from section 2, and the public views
     from rule 2.
  b) Design tokens, Tailwind config, PublicLayout (header with logo/wordmark "Safe Nest Housing",
     nav: Services, Properties, About, News, Contact, "Make a referral" primary button; mobile menu;
     footer with contact, policy links, charity line; the safety strip + Leave-this-site-quickly button).
  c) Public pages:
     /                 Hero with the editable homepage.headline (default "A safe place to land. The
                       support to move on."), two CTAs ("Make a referral", "Explore our services"),
                       three stats from settings (94% sustained move-on, 12 new rooms, 7-day response
                       target), services grid, "How referral works" 4-step strip, properties teaser,
                       latest 3 news posts, safeguarding note.
     /services         List of published services. /services/:slug detail: summary, who it is for,
                       eligibility, support model, referral routes, related properties, CTA.
     /properties       Cards of published, non-confidential properties: public name, neighbourhood,
                       service type, vacancy state, facilities, accessibility. Filter by service and
                       vacancy. /properties/:slug detail. Confidential refuges are never listed; show
                       one generic line: "Some of our homes are confidential and are not listed."
     /news, /news/:slug (category filter, published only)
     /about (mission, approach, team from team_members), /safeguarding, /privacy, /cookies,
     /accessibility, /contact, 404.
     /referrals        Multi-step referral form: (1) Immediate danger notice → (2) About you (name,
                       organisation, role, relationship to person, email, phone) → (3) About the person
                       (name or initials, identifier optional, age range incl. "Under 18" and "Prefer
                       not to say", pronouns, safe contact details with helper "Only how and when it is
                       safe to contact them") → (4) Situation (current location/housing situation,
                       requested service, what is happening now, support needs, known risks,
                       accessibility & communication needs, funding route) → (5) Consent & privacy
                       acknowledgement, "This is an anonymous domestic-abuse referral" checkbox →
                       review → submit. Autosave nothing to localStorage (shared devices). Selecting
                       "Under 18" shows a notice to contact children's services and the local
                       authority. Submission goes to an Edge Function `submit-referral` that validates,
                       checks honeypot + rate limit, inserts with status NEW, writes audit + status
                       history, emails the referral inbox with ONLY the reference and a CRM link, and
                       emails the referrer an acknowledgement with ONLY the reference and next steps.
     /referral-success Shows the reference (SN-R-000123), what happens next, the 7-day response target.
     /contact          Form (name, email, phone, category, message, consent) → Edge Function
                       `submit-contact` with the same protections.
  d) Staff auth pages at /staff/login, /staff/forgot-password, /staff/reset-password (no sign-up),
     with lockout, login_attempts logging and audit; after login go to /crm (Phase 2 will fill it —
     for now an empty CRM shell with only Overview).
  e) SEO: per-page title/description from seo fields, sitemap and robots that list only public,
     published routes, `noindex` on /staff and /crm.
  f) Seed script with clearly fictional data: org "Safe Nest Housing"; services Supported
     accommodation, Homelessness support, Care leavers and young people, Domestic abuse, Mental
     health, Refugee move-on; properties Willow House, Harbour Court, Fenwick Road, Alder Terrace,
     Linden Place (make one confidential); 5 news posts across the 5 categories; settings values;
     one fictional admin user.

Before writing code, reply with: the list of tables and RLS policies you will create, the public
views and their columns, and the Edge Functions. Then build. At the end, list anything you could not
enforce server-side so I can review it.
```

---

## Part 2 — Phase prompts (paste one at a time, after checking the previous phase)

### Phase 2 — CRM shell, users, roles, dashboard, referrals

```
Phase 2. Keep every rule from the master prompt.

1. CRM shell exactly as in the design system: sidebar groups, top bar, global search (placeholder
   until Phase 6), notifications bell backed by the `notifications` table with realtime updates.
   Idle timeout dialog (30 min, 2-minute warning). Route guard: unauthenticated → /staff/login.
2. Users & roles (/crm/users), org_admin only: user register table (name, email, job title, roles,
   scope, active, last login), invite user by email (Supabase invite) with roles and service/property
   scope, change roles, deactivate/reactivate (audited, cannot deactivate yourself or the last
   org_admin), grant/revoke restricted access assignments with reason and expiry. MFA: enrol TOTP in
   "My account", org_admin can require MFA for everyone.
3. Overview (/crm/dashboard): greeting, metric cards (Current residents, Rooms available, Open
   referrals, Open incidents), "Referrals needing action" table (NEW/ACKNOWLEDGED/AWAITING_INFORMATION
   or follow-up date due), "Today's tasks", "Occupancy by property" bars, "Attention queue"
   (overdue tasks, support-plan reviews due within 14 days, HB claims needing evidence, documents
   expiring within 30 days). Respect role and scope.
4. Referrals:
   /crm/referrals — filter bar (status, service, assignee, date range, search by reference/name),
     table: reference, person (initials only in list view), service, status badge, assignee, received,
     follow-up date. Saved filter in the URL.
   /crm/referrals/new — staff-entered referral using the same fields as the public form.
   /crm/referrals/:id — header with reference, status badge, assignee and the allowed "Next status"
     actions ONLY from the transition map (reason dialog where required), tabs: Details, Risks
     (restricted by default), Notes, Documents (Phase 5), History (status history + assignment
     history). Assign/reassign with history. "Convert to client" when moving to PLACED.
   All status changes go through RPC `transition_referral(referral_id, next, reason)`; write a unit
   test (Vitest) covering every allowed and a sample of forbidden transitions.
5. Email: Edge Function `send-email` using SMTP credentials stored in organisation_secrets (provider:
   Emailit SMTP; host/port/user/password/from configurable in Settings → Email, password never shown
   after saving, "Send test email" button). Templates for: referral received (internal), referral
   acknowledgement (referrer), password reset, user invite, task assigned, incident escalated.
   Subjects contain only the reference, e.g. "New referral SN-R-000123".
```

### Phase 3 — Clients, relationships, support plans, case notes

```
Phase 3. Keep every rule from the master prompt.

1. /crm/clients — list with filters (status, service, key worker, risk level, safeguarding flag),
   restricted rows show a lock icon and redacted name unless the user can view restricted.
   "New client" drawer (display name, service, key worker, risk level, status default WAITLIST,
   admission date, contact fields).
2. /crm/clients/:id — header card: display name, reference, status, risk badge, safeguarding flag,
   key worker, current placement (property + room), important alerts banner (amber) and
   communication needs. Tabs:
   - Overview: personal details (edit with audit), pronouns, DOB/age, contact details.
   - Relationships: list of linked clients and related people with type, emergency contact /
     next-of-kin chips, dates, notes. Add relationship dialog: search existing clients
     (debounced, by name or reference) or create a related person; pick type from the list in the
     master prompt; inverse is computed and shown on the other client automatically; end a
     relationship with an end date rather than deleting. Prevent duplicates and self-links.
   - Support plan: current version with goals grouped by category and status; "Edit plan" creates a
     new version (old one SUPERSEDED); add review (date, notes, reviewer); version history view;
     review-due warning when review_date is within 14 days or past.
   - Case notes: reverse-chronological timeline, filter by category/contact type/author, create note
     form (contact type, category, note, outcome, follow-up action + date which optionally creates a
     task), Save draft / Finalise. Finalised notes show a lock and only an "Add addendum" action
     (reason required); addenda render under the original. Enforce immutability with a DB trigger and
     test it.
   - Placements, Incidents, Tasks, Housing Benefit, Documents tabs show related items (filled in by
     later phases; show an empty state for now if the module is not built yet).
   - Activity: audit entries for this client (without sensitive content).
   Viewing a restricted client writes an audit row ("restricted_record_viewed").
3. Finance-only users cannot open Case notes, Support plan or Incidents tabs (hide + RLS deny).
```

### Phase 4 — Properties, rooms, placements, incidents, tasks, rota

```
Phase 4. Keep every rule from the master prompt.

1. /crm/properties — cards/table with occupancy (occupied/capacity), voids, maintenance count,
   public vacancy state. /crm/properties/:id — tabs: Overview (public fields + staff-only secure
   address shown behind a "Reveal address" click that is audited), Rooms (create room, change status
   with reason, see current occupant link), Occupancy history, Tasks, Rota.
2. /crm/placements — metric cards (Active placements, Available rooms, Placement records) and a
   placement register. Create placement via RPC `create_placement(client, room, start_date,
   tenancy_ref)` enforcing room AVAILABLE + no overlapping occupancy; end placement via
   `end_placement(id, end_date, reason)` → room VOID, client MOVED_ON optional. A "Placement board"
   view: columns per property, room tiles coloured by status.
3. Incidents: /crm/incidents list (severity, status, category, lead, date; restricted handling),
   create form (client optional, category, severity, date/time, general location, description,
   immediate action, lead). /crm/incidents/:id — status via RPC with allowed flow DRAFT → OPEN →
   UNDER_REVIEW → (EXTERNAL_REFERRAL_MADE | ACTION_PLAN_ACTIVE) → MONITORING → CLOSED; append-only
   updates timeline; actions checklist (owner, due date, complete); closure panel requiring closure
   decision and completed actions, restricted to safeguarding_lead/service_manager. High/Critical
   create notifications + email to safeguarding leads (subject: "Incident SN-I-0042 needs review").
4. Tasks: /crm/tasks list and "My tasks" toggle, filters (status, priority, assignee, due, linked
   record), overdue badge, quick status control, detail page with edit; link to client, property,
   referral or incident. Assigning notifies the assignee.
5. Rota: /crm/rota weekly calendar grid (rows = properties or staff, toggle), create/edit shift
   (type, property/service, start, end, assigned staff, handover notes); block overlapping
   assignments for the same person unless an override reason is entered; highlight unfilled shifts;
   shift detail page with handover notes.
```

### Phase 5 — Billing, Housing Benefit, documents

```
Phase 5. Keep every rule from the master prompt.

1. Housing Benefit tab on the client and a Billing → Housing Benefit list: claim status, payment
   status, weekly rent and service charge entered in pounds but stored as pence, evidence required
   note, submitted date. "HB exceptions" = EVIDENCE_REQUIRED, SUSPENDED, REJECTED or payment FAILED/PAUSED.
2. /crm/billing — invoices list (reference, funder, status, total, paid, remaining, due date,
   overdue flag) with metric cards (Outstanding, Overdue, Paid this month). Invoice editor (DRAFT
   only): line items with quantity × unit price, total computed in the database. Issue, Void (reason),
   record payment (cannot exceed remaining; status auto PART_PAID/PAID). Download invoice PDF
   generated in an Edge Function (organisation name, invoice reference, funder, items, totals,
   payment instructions — no client sensitive details beyond a reference). Mark OVERDUE automatically
   for issued invoices past due date.
3. Documents: /crm/documents library + Documents tabs on clients and referrals. Upload via Edge
   Function `upload-document` (size/type/magic-byte checks, SHA-256, private bucket, scan status
   PENDING → CLEAN; if no scanner is configured mark SKIPPED and show a warning badge). Category,
   restricted flag, expiry and review dates, new version upload, version history. Download via Edge
   Function `download-document` that re-checks permission and returns a 60-second signed URL, with
   audit. Documents with INFECTED status cannot be downloaded. Expiring-soon filter.
```

### Phase 6 — Content, reports, search, governance, audit, settings

```
Phase 6. Keep every rule from the master prompt.

1. /crm/content (content_editor, org_admin): edit services, public property fields (never
   secure_address), news posts (markdown editor with preview, category, featured image with alt
   text, publish/unpublish, schedule published_at), team members, homepage settings and contact
   settings. Image uploads go to a separate PUBLIC "public-media" bucket; strip EXIF metadata.
   Show a confidentiality checklist before publishing ("No addresses, no resident names, no
   identifiable photos without written consent").
2. /crm/search: global search across referrals, clients, properties, incidents, tasks by reference
   and name, results respect RLS and restricted rules (restricted hits shown as "Restricted record").
   Keyboard shortcut "/" focuses search.
3. /crm/reports (service_manager, org_admin, auditor; finance gets finance reports only): metric cards
   (Properties, Referrals, HB exceptions, Incident actions), referral funnel by status and service,
   occupancy rate over time, average days from referral to placement, incidents by category and
   severity, overdue tasks, invoice ageing. Date range + service filters. CSV export via Edge Function
   that excludes free-text narrative fields (notes, descriptions, risks), uses references not names
   unless the user explicitly ticks "include names" and has permission, protects against CSV formula
   injection (prefix = + - @ with '), and records an export history row + audit. Show "Export history".
4. /crm/governance (org_admin, safeguarding_lead): retention rules (create/edit, legal basis
   required), data subject requests (create with subject reference, due date auto one month, status
   flow, legal hold place/release as separate audited steps, resolution note required to close),
   "Run retention review (dry run)" with results table and run history. Clearly label: "Dry run —
   nothing is deleted."
5. /crm/audit (org_admin, auditor): filterable audit log (actor, action, resource type, date range,
   success), read-only, CSV export of audit metadata only.
6. /crm/settings: organisation details, homepage/contact settings, email provider (Emailit SMTP)
   with masked secrets and test send, MFA requirement, session timeout. All changes audited.
```

### Phase 7 — Hardening and launch checks

```
Phase 7. Review the whole app against the master prompt and fix gaps.

1. Write a checklist report of every table and its RLS policies per role, and prove with SQL tests
   (pgTAP or Supabase test helpers) that: anon cannot read any base table; a support_worker cannot
   read clients outside their scope; nobody without restricted access can read restricted case
   notes/incidents; finance_officer cannot read case_notes/incidents/support_plans; audit_log cannot
   be updated or deleted; finalised case notes cannot be changed; public views never contain
   secure_address, room labels or confidential properties.
2. Vitest unit tests for: referral transitions, room availability and occupancy overlap, rota
   overlap, task overdue, invoice total and remaining balance, data-subject request closure under
   legal hold, relationship inverse mapping, CSV formula escaping.
3. Playwright tests: public referral submission end to end; staff login → create client → add case
   note → finalise → add addendum; create placement and see room become OCCUPIED; invoice payment.
4. Check every form for loading/disabled states on submit, double-submit protection and clear error
   summaries. Check all pages at 360px width with no horizontal scroll.
5. Security headers via hosting config (CSP without unsafe-inline where possible, X-Frame-Options
   DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy blocking camera/mic/
   geolocation, HSTS).
6. Remove all seed/fictional data from production; provide a one-off "bootstrap first admin" SQL
   or Edge Function that creates the organisation, roles and exactly one real administrator with no
   fictional data.
7. List anything that still needs a human decision before real resident data is stored: retention
   periods, DPIA sign-off, privacy notice wording, data-sharing agreements, safeguarding policy,
   backup/restore test, malware scanner provider.
```

---

## Notes for you (not for Lovable)

- **Lovable runs as a client-side React app with Supabase.** It does not do server rendering like the
  current Next.js build. That means public-page SEO is weaker, and all security depends on Supabase
  RLS, RPC functions and Edge Functions, not on the front end. Check the RLS policies yourself
  (Phase 7 asks Lovable to list and test them) before any real resident data goes in.
- **Roles are a step up from the current repo.** In the existing build, any signed-in staff member can
  reach every CRM module (`docs/permissions-matrix.md`, `src/lib/auth.ts`). The prompt asks Lovable
  for real role- and scope-based access, which the docs already say is needed before handling real
  resident data.
- **MFA.** The prompt includes TOTP MFA. MFA is currently turned off in your local `.env`; the Lovable
  version should launch with it on.
- **Email.** The prompt keeps Emailit as the SMTP provider, with credentials stored server-side.
- **Seed contact details.** The seed's support phone number and `safenesthousing.org.uk` emails are
  placeholders. Replace them with real, verified details in Settings before launch.
