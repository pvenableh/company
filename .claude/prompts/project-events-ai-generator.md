# Project Events AI-Enhanced Generator

## Goal
Add a project event/milestone generator that creates a complete timeline of `project_events` based on project type. Uses predefined templates for structure (reliability) with AI enhancement for customization (flexibility). Users review, adjust, and approve the generated timeline before it's saved.

## Context
- The app manages projects for a creative agency (branding, web design, print, campaigns, etc.)
- Projects likely have a `project_events` collection in Directus for milestones/events
- There's an existing LLM infrastructure: `server/utils/llm/factory.ts` with `getLLMProvider()`
- The email AI wizard is a good reference for the questionnaire pattern

## Requirements

### Phase 1: Project Event Templates (Algorithm-based)

Define milestone templates per project type with default durations and dependencies:

**Branding Project:**
1. Contract Signed (Day 0)
2. Discovery & Research (5 days)
3. Mood Board / Direction Presentation (3 days)
4. Client Review - Direction (3 days)
5. Logo Concepts - Round 1 (5 days)
6. Client Review - Round 1 (3 days)
7. Logo Refinement - Round 2 (3 days)
8. Client Review - Round 2 (2 days)
9. Final Logo Delivery (2 days)
10. Brand Guidelines Development (5 days)
11. Final Brand Package Delivery (2 days)

**Web Design Project:**
1. Contract Signed (Day 0)
2. Discovery & Requirements Gathering (5 days)
3. Sitemap & Wireframes (5 days)
4. Client Review - Wireframes (3 days)
5. Design Mockups - Round 1 (7 days)
6. Client Review - Design Round 1 (3 days)
7. Design Revisions - Round 2 (4 days)
8. Client Review - Design Round 2 (2 days)
9. Development Sprint 1 (10 days)
10. Development Sprint 2 (10 days)
11. Internal QA & Testing (3 days)
12. Client Review - Staging (5 days)
13. Bug Fixes & Revisions (3 days)
14. Content Migration (3 days)
15. Launch Preparation (2 days)
16. Go Live (1 day)
17. Post-Launch Support (5 days)

**Print Production Project:**
1. Contract Signed (Day 0)
2. Creative Brief (3 days)
3. Design Concepts - Round 1 (5 days)
4. Client Review - Round 1 (3 days)
5. Design Revisions - Round 2 (3 days)
6. Client Review - Round 2 (2 days)
7. Final Design Approval (1 day)
8. Print-Ready File Preparation (2 days)
9. Proof Review (2 days)
10. Print Production (5-10 days)
11. Quality Check (1 day)
12. Delivery / Distribution (2 days)

**Campaign Project:**
1. Contract Signed (Day 0)
2. Strategy & Planning (5 days)
3. Creative Brief (3 days)
4. Asset Design - Round 1 (7 days)
5. Client Review - Round 1 (3 days)
6. Asset Revisions - Round 2 (4 days)
7. Client Review - Round 2 (2 days)
8. Campaign Setup (3 days)
9. Campaign Launch (1 day)
10. Monitoring & Optimization (ongoing)
11. Mid-Campaign Report (varies)
12. Campaign Wrap-Up Report (3 days)

**Photography/Video Project:**
1. Contract Signed (Day 0)
2. Pre-Production Planning (5 days)
3. Shot List / Storyboard (3 days)
4. Client Review - Plan (2 days)
5. Shoot Day(s) (1-3 days)
6. Post-Production - Round 1 (5-7 days)
7. Client Review - Round 1 (3 days)
8. Post-Production - Round 2 (3 days)
9. Client Review - Round 2 (2 days)
10. Final Delivery (2 days)

### Phase 2: AI Enhancement Layer

After the template generates the base timeline, AI adjusts it based on:
- **Project scope** (small/medium/large/enterprise) → scales durations
- **Client type** (new client vs returning) → adds/removes discovery steps
- **Deadline** → compresses or expands timeline to fit
- **Special requirements** (e.g., "needs accessibility audit", "multi-language") → inserts extra milestones
- **Team size** → affects parallelism of tasks

### Questionnaire Flow (Modal or Page Section)

**Step 1 — "Project basics"**
- Project type selector (Branding, Web Design, Print, Campaign, Photo/Video, Custom)
- Project scope: Small, Medium, Large, Enterprise
- Client: Select from existing clients (or new)
- Start date (default: today)
- Target deadline (optional)

**Step 2 — "Customize"**
- AI-generated timeline preview based on type + scope
- Visual timeline/list view showing all milestones with dates and durations
- Each milestone is editable: rename, change duration, reorder, delete
- "Add milestone" button to insert custom events
- Toggle milestones on/off (e.g., skip "Round 2" if client wants fewer review cycles)
- Optional notes per milestone

**Step 3 — "Review & create"**
- Final timeline summary with total project duration
- Gantt-like visual or simple timeline view
- "Create Events" button → saves all `project_events` to Directus
- Option to assign team members to specific milestones

### Server Endpoint — `server/api/projects/generate-events.post.ts`
- Authenticated endpoint
- Accepts: `{ projectId, projectType, scope, startDate, deadline?, specialRequirements?, clientType? }`
- Step 1: Load the template for the project type
- Step 2: Call AI to adjust durations/add milestones based on scope, deadline, requirements
- Step 3: Return the proposed timeline as JSON
- Separate endpoint or flag to actually save: `server/api/projects/save-events.post.ts`

### Data Model
Explore the existing `project_events` collection in Directus to understand the schema. The generated events should include:
- `project` (FK to projects)
- `name` / `title`
- `description`
- `type` / `category` (discovery, design, review, development, production, delivery, etc.)
- `start_date`
- `end_date` or `duration_days`
- `sort` / `order`
- `status` (pending, in_progress, completed, skipped)
- `assigned_to` (optional, FK to users)
- `depends_on` (optional, FK to another event for dependency tracking)

### Integration Points
- Add "Generate Timeline" button to the project detail page or project creation flow
- When creating a new project, offer to auto-generate events after the project record is saved
- The timeline editor should be reusable — it can also be used to manually manage existing project events

## Technical Notes
- Check the existing `project_events` (or similar) collection schema in Directus before building
- Reuse `getLLMProvider()` from `server/utils/llm/factory.ts` for AI enhancement
- Use `getServerDirectus()` or `getUserDirectus(event)` depending on the auth context
- Follow existing patterns: shadcn-vue components, Lucide icons, Tailwind CSS v4
- The timeline templates should be stored as TypeScript constants (not in the database) for easy maintenance
- Consider making the templates configurable per organization in the future
