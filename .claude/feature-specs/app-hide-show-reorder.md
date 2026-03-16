# Feature: App Hide/Show/Reorder (iPhone Home Screen Concept)

## Overview
Allow users to hide/show navigation apps and drag-reorder them, similar to an iPhone home screen. Users can streamline what they see by hiding unused apps and organizing the order of visible ones.

## Architecture

### Data Structure
Navigation items currently defined as a static array in `app.vue` (lines 33-124). Each link has:
- `name`, `to` (route), `icon`, `type` (array of: header, footer, toolbar, drawer)

### Storage Pattern
Follow the existing `useAIPreferences.ts` composable pattern:
- Per-user localStorage with Directus user ID key
- `useNavPreferences` composable with: `enabledApps`, `appOrder`, `toggle()`, `reorder()`, `save()`, `load()`
- Key: `nav-preferences-{userId}`
- Shape: `{ visible: string[], order: string[] }`

### Components Involved
- `app.vue` — Move links definition to a composable, filter by user preferences
- `layouts/default.vue` — Filter links by visibility + sort by order
- `components/Layout/NavDrawer.vue` — Add edit mode toggle (pencil icon) for reorder/hide
- `components/Layout/MobileToolbar.vue` — Respect user order for tab bar
- **NEW** `components/Layout/NavEditor.vue` — Edit mode overlay with:
  - Drag handles on each nav item
  - Toggle switches to show/hide
  - "Reset to default" button
  - Jiggle animation (like iOS edit mode)

### Drag-and-Drop
Use the existing sort pattern from `useClients.ts`:
- Numeric `sort` field per item
- Update sort values on drag completion
- Libraries already in project: could use native HTML5 drag or GSAP Draggable

### Available Apps (14 items)
1. Command Center (`/`)
2. Statistics (`/dashboard`)
3. Tickets (`/tickets`)
4. Projects (`/projects`)
5. Scheduler (`/scheduler`)
6. Channels (`/channels`)
7. Invoices (`/invoices`)
8. Time Tracker (`/time-tracker`)
9. Social (`/social/dashboard`)
10. Email (`/email`)
11. Financials (`/financials`)
12. Contacts (`/contacts`)
13. Clients (`/clients`)
14. Teams (`/organization/teams`)
15. Files (`/files`)

### UX Concept
- Long-press or pencil icon enters edit mode
- Items jiggle (CSS animation, like iOS)
- Drag to reorder
- Tap minus/toggle to hide
- Hidden apps shown greyed out at bottom
- "Done" button exits edit mode
- Changes persist immediately to localStorage
- Optional: sync to Directus `user_nav_preferences` collection for cross-device persistence

### Key Files to Reference
- `composables/useAIPreferences.ts` — Storage pattern
- `composables/useClients.ts` — Sort/reorder pattern
- `composables/useDirectusItems.ts` — Generic CRUD for Directus
- `components/Layout/NavDrawer.vue` — Current nav rendering
- `components/Layout/MobileToolbar.vue` — Mobile tab bar
- `app.vue` lines 33-124 — Current nav item definitions
