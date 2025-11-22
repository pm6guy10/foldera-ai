# 📂 FOLDERA: THE CONTINUITY PROTOCOL (v2.1)

**"The Sunday Night Update"**

---

## 0. DEVELOPMENT STANDARDS (The "Genius" Protocol)

**YOU ARE A SENIOR TYPESCRIPT ARCHITECT.**

Inject this into Cursor "User Rules" before writing code.

- **No Guessing:** Before using a variable, scroll up to find its definition. Copy the name exactly.
- **Strict Types:** Never use `any`. If a type is missing, define the Interface first.
- **Verify:** After writing code, run a mental "compiler check" on variable names and imports.
- **Context:** If editing a file, read the imports and the props interface first.
- **Debug Mode:** Always keep Cursor's "Debug Mode" ON to force diagnosis before patching.

---

## 1. THE MISSION (The Soul)

We are building a **"Zero-Miss Operations Engine."**

- **Identity:** We are not a Chatbot. We are an Autonomous Chief of Staff.
- **The Core Loop:** Observe (Scan) → Detect (Find Mess) → Plan (Draft Solution) → Approval (Magic Link) → Execute (API Call).
- **The Goal:** To redeem time. To replace "Toil" (moving files, scheduling) with "Flow" (One-click approval).

---

## 2. THE INFRASTRUCTURE (The Body)

- **Frontend:** Next.js 14 (App Router).
- **Architecture:** "Client Shell Pattern" (Dynamic imports with `ssr: false`) is mandatory for all dashboard pages.
- **Hosting:** Vercel.
- **Database:** Supabase (Postgres).
- **Tables:** `work_signals`, `signal_relationships`, `risk_alerts`, `pending_actions`.
- **Security:** RLS enabled. Service Role for backend scripts; Anon Key for frontend.
- **Authentication:** NextAuth.js (Google Provider).
- **Scopes:** `gmail.readonly`, `gmail.compose`, `drive` (Full Access), `calendar.readonly`.
- **Intelligence:** OpenAI GPT-4o.

---

## 3. CURRENT DEVELOPMENT STATE (The Brain)

**Status:** Phase 3 (Context Engine) Foundation is **COMPLETE**.  
**Next:** Building Real API Connectors.

### ✅ What is Working (Verified)

**The Universal Brain (Logic):**
- **File:** `lib/ingest/processor.ts`
- **Capability:** Ingests generic WorkSignal objects (Slack, Calendar, Gmail). Uses GPT-4o to detect cross-signal conflicts (e.g., "Slack message cancels Calendar event").

**The Cortex (Memory):**
- **Database:** `work_signals` and `signal_relationships` tables.
- **Capability:** Persists the Knowledge Graph. Allows querying: "Show me everything that blocks Project Phoenix."

**The Briefing Agent (Narrator):**
- **File:** `scripts/run-briefing-agent.ts`
- **Capability:** Queries the DB for conflicts → Generates Executive Briefing → Sends Email directly to User.

**The Drive Janitor & Hunter-Killer:**
- Fully operational legacy agents for File Organization and Email Replies.

### 🚧 What is Next (The Frontier)

We have the Brain, but it is fed by "Mock Data" (The Sunday Simulator). We need to plug in the real pipes.

- **Slack Connector:** Build the API integration to fetch real Slack messages into WorkSignal.
- **Calendar Connector:** Build the API integration to fetch real GCal events.
- **The Dashboard:** Visualize the `signal_relationships` graph in the UI.

---

## 4. OPERATIONS MANUAL

### The "God Mode" Workflow

We do not write code line-by-line. We act as Architects.

1. **The Architect (User):** Defines the feature.
2. **The Blueprint (AI):** Writes the detailed "Batch Prompt."
3. **The Builder (Cursor):** Executes the prompt using Standards (Section 0).

### Key Commands

| Command | Description |
|---------|-------------|
| `npx tsx scripts/simulate-sunday.ts` | The Simulator. Runs the full Phase 3 loop: Ingest Mock Data → Detect Conflict → Save to DB → Send Briefing Email. |
| `npx tsx scripts/run-drive-janitor.ts` | The Janitor. Scans Drive, drafts plan, sends Magic Link. |
| `npx tsx scripts/run-contradiction-scan.ts` | The Auditor. Scans Drafts vs Contracts for legal risks. |

---

## 5. THE ROADMAP (The Vision)

### Phase 1: Foundation ✅ COMPLETE

- Gmail Hunter-Killer (Draft replies)
- Drive Janitor (File organization)
- Magic Link Execution (One-click approval)

### Phase 2: The Intelligence Layer ✅ COMPLETE

- **Contradiction Engine:** Scans Drafts vs Drive Contracts. Alerts on risk.
- **Risk Database:** `risk_alerts` table operational.

### Phase 3: The Sunday Night Cure (IN PROGRESS)

- ✅ Universal Signal Type: WorkSignal interface defined.
- ✅ Reasoning Engine: GPT-4o detects conflicts across signals.
- ✅ Persistence: Knowledge Graph stored in Supabase.
- ✅ Briefing Agent: Sends "Monday Morning Briefing" email.
- 🚧 Real Connectors: Slack & Calendar API integration.

---

## 6. THE SOUL OF THE MACHINE

### The Why Behind the Code

#### 1. WorkSignal = The End of Fragmentation

- **The Pain:** The world is fractured. Truth is scattered across Slack, Gmail, and Jira.
- **The Code:** By normalizing everything into WorkSignal, we are spiritually "Gathering the Fragments." We create wholeness out of chaos.

#### 2. The Janitor = The End of Drudgery

- **The Pain:** People spend 80% of their time moving files. That is "Toil" (the curse).
- **The Code:** The Janitor removes the curse of toil. It frees the human for Creativity, Leadership, and Love.

#### 3. The "Sunday Night Cure" = The End of Anxiety

- **The Pain:** The dread of "What did I miss?" steals the Sabbath.
- **The Code:** The Agent watches the wall so the Watchman can sleep. By catching risks before Monday, we are protecting Rest.

---

### The Verdict

You are not building a SaaS tool. You are building a **"Margin Engine."**

If you give a CEO back 5 hours a week, and he uses that time to be a better father, you have saved a world.

**This is the Ministry of Efficiency.**

