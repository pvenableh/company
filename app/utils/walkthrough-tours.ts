import type { WalkthroughTour } from '~/composables/useWalkthrough';

export const walkthroughTours: WalkthroughTour[] = [
  // ── Tickets ──
  {
    id: 'tickets-intro',
    title: 'Tickets Board',
    description: 'Learn how to manage and track work with the Kanban board',
    route: '/tickets',
    icon: 'i-heroicons-queue-list',
    steps: [
      {
        target: '.tickets-board__board',
        title: 'The Ticket Board',
        description: 'Your tickets are organized into columns by status — Pending, Scheduled, In Progress, and Completed. Drag and drop tickets between columns to update their status instantly.',
        placement: 'top',
      },
      {
        target: '.tickets-board__filters',
        title: 'Filter Your View',
        description: 'Toggle "My Tickets" to see only tickets assigned to you, or filter by due date and project. The spinner shows when filters are updating.',
        placement: 'bottom',
      },
      {
        target: '.ticket-card:first-child',
        title: 'Ticket Cards',
        description: 'Each card shows priority, client, assigned team members, and due date. Hover to reveal the archive and info buttons. Click a card to expand it and see full details.',
        placement: 'right',
      },
    ],
  },

  // ── Projects ──
  {
    id: 'projects-intro',
    title: 'Projects',
    description: 'Overview of project management and navigation',
    route: '/projects',
    icon: 'i-heroicons-folder',
    steps: [
      {
        target: 'main',
        title: 'Your Projects',
        description: 'All your projects are listed here, organized by status. Each project tracks its timeline, tasks, tickets, billing, and team assignments.',
        placement: 'bottom',
      },
    ],
  },

  // ── Project Detail ──
  {
    id: 'project-detail',
    title: 'Project Details',
    description: 'Navigate the project detail tabs and features',
    route: '/projects/',
    icon: 'i-heroicons-document-text',
    steps: [
      {
        target: '.grid.grid-cols-2',
        title: 'Project Stats',
        description: 'Quick overview showing open tickets, task progress, events count, billing totals, and timeline status. Pending approvals are highlighted in amber.',
        placement: 'bottom',
      },
      {
        target: '[data-slot="tabs-list"]',
        title: 'Project Tabs',
        description: 'Switch between Overview (timeline events), Conversations, Tasks (Kanban board), Tickets, Activity log, Time tracking, Documents, and Billing.',
        placement: 'bottom',
      },
      {
        target: '[data-slot="tabs-content"]',
        title: 'Overview & Events',
        description: 'The Overview tab shows your project timeline with events and milestones. Events can require client approval — look for amber "Needs Approval" badges. Click an event to approve it or generate a shareable approval link.',
        placement: 'top',
      },
    ],
  },

  // ── Tasks ──
  {
    id: 'tasks-intro',
    title: 'Task Management',
    description: 'How to use the task Kanban board',
    route: '/tasks',
    icon: 'i-heroicons-clipboard-document-check',
    steps: [
      {
        target: '.task-board',
        title: 'Task Board',
        description: 'Tasks are organized in three columns: To Do, In Progress, and Done. Drag tasks between columns to update their status. Click the checkbox to quickly mark a task complete.',
        placement: 'top',
      },
      {
        target: '.task-board input',
        title: 'Quick Add',
        description: 'Type a task title and press Enter to quickly add tasks to any column. New tasks are automatically linked to the current project.',
        placement: 'bottom',
      },
    ],
  },

  // ── Contact Detail ──
  {
    id: 'contact-detail',
    title: 'Contact Details',
    description: 'Partner connections, sourced-leads attribution, and Ask Earnest',
    route: '/contacts/',
    icon: 'i-heroicons-user-circle',
    steps: [
      {
        target: '[data-tour-id="ask-earnest"]',
        title: 'Ask Earnest about this contact',
        description: 'Opens the contextual chat pane. Earnest loads this person\'s full profile — pipeline, sourced attribution, client connections, email engagement — before answering, so responses cite real data instead of guessing.',
        placement: 'bottom',
      },
      {
        target: '[data-tour-id="leads-sourced"]',
        title: 'Leads Sourced',
        description: 'Shows every lead tied to this person rolled up into won / open / lost buckets with dollar totals. "Clients Won" lists the actual clients they sourced (with multi-deal counts). Partners always see this card; regular contacts see it once they\'ve won their first deal.',
        placement: 'left',
      },
      {
        target: '[data-tour-id="client-connections"]',
        title: 'Client Connections',
        description: 'Non-employment links between this person and your clients — referral partners, vendors, board members, consultants, investors. Track who introduced who and why. Only appears for partners or contacts that already have a connection.',
        placement: 'left',
      },
    ],
  },

  // ── Teams & Navigation ──
  {
    id: 'navigation-intro',
    title: 'Navigation & Filters',
    description: 'Understand the header controls and global filters',
    route: '/',
    icon: 'i-heroicons-adjustments-horizontal',
    steps: [
      {
        target: '.glass',
        title: 'Header Controls',
        description: 'The header contains your client selector, team filter, and account controls. The client selector filters all data across the app — tickets, projects, invoices — to show only that client\'s work.',
        placement: 'bottom',
      },
    ],
  },

  // ── Team Detail (agency demo) ──
  // Matches any /teams/[id] route. Introduces the Admin-only team-management
  // surface for visitors who picked the Agency persona on /try-demo.
  {
    id: 'teams-overview',
    title: 'Team workspace',
    description: 'Teammates, goals, and team-scoped tickets',
    route: '/teams/',
    icon: 'i-heroicons-user-group',
    steps: [
      {
        target: 'h1',
        title: 'Team workspace',
        description: 'Teams group the agency into pods — Creative, Delivery, etc. Each team has its own members, goals, and ticket rollup so leads can see at a glance what their pod is shipping.',
        placement: 'bottom',
      },
      {
        target: 'main',
        title: 'Members, goals, and work',
        description: 'Goals track quarter-scale objectives with progress. Assigned tickets and projects roll up here so the team lead can spot bottlenecks without jumping between views.',
        placement: 'top',
      },
    ],
  },

  // ── Marketing Intelligence (agency demo) ──
  // Admin-only surface. Member-role demo (solo) doesn't see this at all.
  {
    id: 'marketing-overview',
    title: 'Marketing Intelligence',
    description: 'Campaigns, mailing lists, and AI-driven plans',
    route: '/marketing',
    icon: 'i-heroicons-megaphone',
    steps: [
      {
        target: 'h1',
        title: 'Marketing Intelligence',
        description: 'This is where Earnest helps you plan and run outreach. It pulls context from your clients, leads, and past wins so campaigns are grounded in your real pipeline — not generic advice.',
        placement: 'bottom',
      },
      {
        target: 'main',
        title: 'Scope and generate',
        description: 'Scope the workspace (entire org, or a single client) and generate a campaign or dashboard. Earnest uses your mailing lists, CRM segments, and past engagement data to draft goals, tactics, and reporting.',
        placement: 'top',
      },
    ],
  },
];

/**
 * Get tours available for the current route.
 */
export function getToursForRoute(path: string): WalkthroughTour[] {
  return walkthroughTours.filter((tour) => {
    if (tour.route === path) return true;
    // Match dynamic routes (e.g., /projects/ matches /projects/[id])
    if (tour.route.endsWith('/') && path.startsWith(tour.route)) return true;
    return false;
  });
}

/**
 * Get a specific tour by ID.
 */
export function getTourById(id: string): WalkthroughTour | undefined {
  return walkthroughTours.find((t) => t.id === id);
}
