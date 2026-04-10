/**
 * Project Timeline Generator — Types & Templates
 *
 * Defines milestone templates for 5 project types with default tasks per milestone.
 * Used by the AI generation endpoint and the AITimelineWizard component.
 */

import type { ProjectEvent, ProjectTask } from '../directus';

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export interface TemplateTask {
  title: string;
  description: string;
  priority: NonNullable<ProjectTask['priority']>;
}

export interface TemplateMilestone {
  name: string;
  duration_days: number;
  type: NonNullable<ProjectEvent['type']>;
  is_milestone: boolean;
  description: string;
  tasks: TemplateTask[];
}

export interface ProjectTemplate {
  id: string;
  label: string;
  icon: string;
  description: string;
  milestones: TemplateMilestone[];
}

// ---------------------------------------------------------------------------
// Wizard / API types
// ---------------------------------------------------------------------------

export interface TimelineGeneratorForm {
  projectType: string;
  scope: 'small' | 'medium' | 'large' | 'enterprise';
  clientType: 'new' | 'returning';
  startDate: string;
  targetDeadline: string;
  specialRequirements: string;
  teamSize: number;
}

export interface ProposedTask {
  id: string;
  title: string;
  description: string;
  priority: NonNullable<ProjectTask['priority']>;
  due_date: string;
}

export interface ProposedEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  end_date: string;
  duration_days: number;
  type: NonNullable<ProjectEvent['type']>;
  is_milestone: boolean;
  enabled: boolean;
  sort: number;
  tasks: ProposedTask[];
}

export interface GenerateTimelineRequest {
  projectId: string;
  projectType: string;
  scope: string;
  clientType: string;
  startDate: string;
  targetDeadline?: string;
  specialRequirements?: string;
  teamSize?: number;
  projectTitle?: string;
  serviceName?: string;
}

export interface GenerateTimelineResponse {
  events: ProposedEvent[];
  summary: string;
  totalDays: number;
}

export interface SaveEventsRequest {
  projectId: string;
  events: Array<{
    title: string;
    description: string | null;
    event_date: string;
    end_date: string;
    duration_days: number;
    type: NonNullable<ProjectEvent['type']>;
    is_milestone: boolean;
    sort: number;
    tasks: Array<{
      title: string;
      description: string | null;
      priority: NonNullable<ProjectTask['priority']>;
      due_date: string;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Service → Template matching
// ---------------------------------------------------------------------------

/** Keywords used to fuzzy-match a Directus service name to a template ID. */
export const SERVICE_TEMPLATE_KEYWORDS: Record<string, string[]> = {
  branding: ['brand', 'identity', 'logo'],
  'web-design': ['web', 'website', 'site', 'app', 'application', 'digital'],
  print: ['print', 'flyer', 'brochure', 'poster', 'packaging', 'collateral'],
  campaign: ['campaign', 'marketing', 'advertising', 'ad', 'social media', 'ads'],
  'photo-video': ['photo', 'video', 'photography', 'videography', 'film', 'shoot', 'production'],
};

/**
 * Attempts to match a service name (e.g. "Web Design & Development") to one of
 * the predefined template IDs.  Returns `null` when no match is found.
 */
export function matchServiceToTemplate(serviceName: string): string | null {
  const lower = serviceName.toLowerCase();
  for (const [templateId, keywords] of Object.entries(SERVICE_TEMPLATE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      return templateId;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scope multipliers
// ---------------------------------------------------------------------------

export const SCOPE_MULTIPLIERS: Record<string, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.4,
  enterprise: 1.8,
};

// ---------------------------------------------------------------------------
// Project templates
// ---------------------------------------------------------------------------

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'branding',
    label: 'Branding',
    icon: 'lucide:palette',
    description: 'Brand identity, logo design, and brand guidelines',
    milestones: [
      {
        name: 'Contract Signed',
        duration_days: 0,
        type: 'Timeline',
        is_milestone: true,
        description: 'Project kickoff and contract execution.',
        tasks: [
          { title: 'Send signed contract to client', description: 'Ensure all parties have executed copies', priority: 'high' },
          { title: 'Set up project workspace', description: 'Create shared folders and communication channels', priority: 'medium' },
        ],
      },
      {
        name: 'Discovery & Research',
        duration_days: 5,
        type: 'General',
        is_milestone: false,
        description: 'Research competitors, audience, and industry trends.',
        tasks: [
          { title: 'Conduct competitor analysis', description: 'Review 5-10 competitor brands for positioning', priority: 'high' },
          { title: 'Client brand questionnaire', description: 'Send and review brand personality questionnaire', priority: 'high' },
          { title: 'Audience research', description: 'Identify target demographics and preferences', priority: 'medium' },
          { title: 'Industry trend analysis', description: 'Research current design trends in the industry', priority: 'low' },
        ],
      },
      {
        name: 'Mood Board / Direction Presentation',
        duration_days: 3,
        type: 'Design',
        is_milestone: false,
        description: 'Create visual mood boards exploring brand directions.',
        tasks: [
          { title: 'Curate inspiration imagery', description: 'Gather visual references for each direction', priority: 'high' },
          { title: 'Create mood boards', description: 'Design 2-3 mood boards with distinct directions', priority: 'high' },
          { title: 'Prepare direction presentation', description: 'Build deck explaining each creative direction', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Direction',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews and selects preferred brand direction.',
        tasks: [
          { title: 'Send mood boards to client', description: 'Share presentation with all stakeholders', priority: 'high' },
          { title: 'Schedule review meeting', description: 'Book review call with decision makers', priority: 'high' },
          { title: 'Document feedback and direction choice', description: 'Record client preferences and approved direction', priority: 'medium' },
        ],
      },
      {
        name: 'Logo Concepts - Round 1',
        duration_days: 5,
        type: 'Design',
        is_milestone: false,
        description: 'Initial logo concept exploration and development.',
        tasks: [
          { title: 'Sketch initial concepts', description: 'Explore 10-15 rough logo directions', priority: 'high' },
          { title: 'Refine top concepts', description: 'Develop 3-5 strongest concepts digitally', priority: 'high' },
          { title: 'Test in context', description: 'Mock up logos on business cards, signage, web', priority: 'medium' },
          { title: 'Prepare concept presentation', description: 'Build deck showing each concept with rationale', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 1',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews initial logo concepts and provides feedback.',
        tasks: [
          { title: 'Present logo concepts', description: 'Walk client through each concept and rationale', priority: 'high' },
          { title: 'Collect detailed feedback', description: 'Document specific feedback on each concept', priority: 'high' },
          { title: 'Confirm direction for refinement', description: 'Get sign-off on 1-2 concepts to refine', priority: 'medium' },
        ],
      },
      {
        name: 'Logo Refinement - Round 2',
        duration_days: 3,
        type: 'Design',
        is_milestone: false,
        description: 'Refine selected logo concepts based on feedback.',
        tasks: [
          { title: 'Apply client feedback', description: 'Iterate on selected concepts with revisions', priority: 'high' },
          { title: 'Explore color variations', description: 'Test brand color palettes on refined logos', priority: 'medium' },
          { title: 'Typography refinement', description: 'Fine-tune letterforms and spacing', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 2',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Client reviews refined concepts and selects final direction.',
        tasks: [
          { title: 'Present refined concepts', description: 'Share updated logo options with context', priority: 'high' },
          { title: 'Get final logo approval', description: 'Obtain sign-off on the selected logo', priority: 'high' },
        ],
      },
      {
        name: 'Final Logo Delivery',
        duration_days: 2,
        type: 'Design',
        is_milestone: true,
        description: 'Prepare and deliver final logo files in all formats.',
        tasks: [
          { title: 'Export all logo variations', description: 'Create primary, secondary, icon, and mono versions', priority: 'high' },
          { title: 'Prepare file formats', description: 'Export SVG, PNG, PDF, EPS for each variation', priority: 'high' },
          { title: 'Create logo usage sheet', description: 'Quick reference showing proper logo usage', priority: 'medium' },
        ],
      },
      {
        name: 'Brand Guidelines Development',
        duration_days: 5,
        type: 'Content',
        is_milestone: false,
        description: 'Develop comprehensive brand guidelines document.',
        tasks: [
          { title: 'Define color system', description: 'Document primary, secondary, and accent colors with codes', priority: 'high' },
          { title: 'Define typography system', description: 'Specify heading, body, and accent typefaces with scales', priority: 'high' },
          { title: 'Create usage guidelines', description: 'Document dos and don\'ts for brand elements', priority: 'medium' },
          { title: 'Design brand guidelines document', description: 'Layout the full guidelines as a branded PDF', priority: 'medium' },
        ],
      },
      {
        name: 'Final Brand Package Delivery',
        duration_days: 2,
        type: 'Timeline',
        is_milestone: true,
        description: 'Deliver complete brand package to client.',
        tasks: [
          { title: 'Compile final asset package', description: 'Organize all deliverables in structured folders', priority: 'high' },
          { title: 'Deliver to client', description: 'Share final package and walk through contents', priority: 'high' },
          { title: 'Archive project files', description: 'Store source files for future reference', priority: 'low' },
        ],
      },
    ],
  },
  {
    id: 'web-design',
    label: 'Web Design',
    icon: 'lucide:monitor',
    description: 'Website design, development, and launch',
    milestones: [
      {
        name: 'Contract Signed',
        duration_days: 0,
        type: 'Timeline',
        is_milestone: true,
        description: 'Project kickoff and contract execution.',
        tasks: [
          { title: 'Send signed contract', description: 'Ensure all parties have executed copies', priority: 'high' },
          { title: 'Set up project workspace', description: 'Create repos, shared folders, communication channels', priority: 'medium' },
        ],
      },
      {
        name: 'Discovery & Requirements Gathering',
        duration_days: 5,
        type: 'General',
        is_milestone: false,
        description: 'Understand business goals, audience, and technical requirements.',
        tasks: [
          { title: 'Stakeholder interviews', description: 'Interview key stakeholders on goals and vision', priority: 'high' },
          { title: 'Content audit', description: 'Review existing content and identify gaps', priority: 'high' },
          { title: 'Technical requirements document', description: 'Define platform, integrations, and constraints', priority: 'medium' },
          { title: 'Competitor website analysis', description: 'Review 5-8 competitor sites for UX patterns', priority: 'medium' },
        ],
      },
      {
        name: 'Sitemap & Wireframes',
        duration_days: 5,
        type: 'Design',
        is_milestone: false,
        description: 'Define site structure and create page wireframes.',
        tasks: [
          { title: 'Create sitemap', description: 'Map out all pages and navigation hierarchy', priority: 'high' },
          { title: 'Wireframe key pages', description: 'Create wireframes for homepage, key landing pages', priority: 'high' },
          { title: 'Define user flows', description: 'Map primary user journeys through the site', priority: 'medium' },
          { title: 'Mobile wireframe considerations', description: 'Ensure mobile-responsive layouts are planned', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Wireframes',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews site structure and wireframes.',
        tasks: [
          { title: 'Present sitemap and wireframes', description: 'Walk through site structure and page layouts', priority: 'high' },
          { title: 'Collect feedback', description: 'Document all feedback and revision requests', priority: 'high' },
          { title: 'Get wireframe approval', description: 'Obtain sign-off before moving to design', priority: 'medium' },
        ],
      },
      {
        name: 'Design Mockups - Round 1',
        duration_days: 7,
        type: 'Design',
        is_milestone: false,
        description: 'Create high-fidelity design mockups for key pages.',
        tasks: [
          { title: 'Design homepage', description: 'Create full-fidelity homepage design', priority: 'high' },
          { title: 'Design interior page templates', description: 'Create 2-3 interior page designs', priority: 'high' },
          { title: 'Design component library', description: 'Define buttons, forms, cards, navigation styles', priority: 'medium' },
          { title: 'Create responsive breakpoints', description: 'Show tablet and mobile layouts', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Design Round 1',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews design mockups and provides feedback.',
        tasks: [
          { title: 'Present design mockups', description: 'Walk through designs with client team', priority: 'high' },
          { title: 'Document feedback', description: 'Record all revision requests and priorities', priority: 'high' },
        ],
      },
      {
        name: 'Design Revisions - Round 2',
        duration_days: 4,
        type: 'Design',
        is_milestone: false,
        description: 'Apply client feedback and refine designs.',
        tasks: [
          { title: 'Apply revision requests', description: 'Implement all client feedback from Round 1', priority: 'high' },
          { title: 'Refine responsive layouts', description: 'Finalize mobile and tablet designs', priority: 'medium' },
          { title: 'Finalize component library', description: 'Complete all UI component designs', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Design Round 2',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Final design review and approval.',
        tasks: [
          { title: 'Present final designs', description: 'Share refined mockups for approval', priority: 'high' },
          { title: 'Get design sign-off', description: 'Obtain final approval to begin development', priority: 'high' },
        ],
      },
      {
        name: 'Development Sprint 1',
        duration_days: 10,
        type: 'General',
        is_milestone: false,
        description: 'Build core site structure, navigation, and primary pages.',
        tasks: [
          { title: 'Set up development environment', description: 'Configure CMS, hosting, and deployment pipeline', priority: 'high' },
          { title: 'Build site framework', description: 'Implement navigation, header, footer, base styles', priority: 'high' },
          { title: 'Develop homepage', description: 'Build homepage with all sections and animations', priority: 'high' },
          { title: 'Develop interior page templates', description: 'Build reusable page templates', priority: 'medium' },
        ],
      },
      {
        name: 'Development Sprint 2',
        duration_days: 10,
        type: 'General',
        is_milestone: false,
        description: 'Build remaining pages, forms, integrations, and interactivity.',
        tasks: [
          { title: 'Build remaining pages', description: 'Complete all interior pages and content', priority: 'high' },
          { title: 'Implement forms and integrations', description: 'Contact forms, newsletter signup, analytics', priority: 'high' },
          { title: 'Implement responsive design', description: 'Ensure all pages work on mobile and tablet', priority: 'high' },
          { title: 'Add interactions and animations', description: 'Implement scroll animations and transitions', priority: 'low' },
        ],
      },
      {
        name: 'Internal QA & Testing',
        duration_days: 3,
        type: 'General',
        is_milestone: false,
        description: 'Internal quality assurance and cross-browser testing.',
        tasks: [
          { title: 'Cross-browser testing', description: 'Test on Chrome, Safari, Firefox, Edge', priority: 'high' },
          { title: 'Mobile device testing', description: 'Test on iOS and Android devices', priority: 'high' },
          { title: 'Performance audit', description: 'Run Lighthouse and optimize load times', priority: 'medium' },
          { title: 'Accessibility check', description: 'Verify WCAG compliance and screen reader support', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Staging',
        duration_days: 5,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews the site on staging environment.',
        tasks: [
          { title: 'Deploy to staging', description: 'Push site to staging URL for client review', priority: 'high' },
          { title: 'Send review instructions', description: 'Provide client with testing checklist', priority: 'high' },
          { title: 'Collect and prioritize feedback', description: 'Document all issues and change requests', priority: 'medium' },
        ],
      },
      {
        name: 'Bug Fixes & Revisions',
        duration_days: 3,
        type: 'General',
        is_milestone: false,
        description: 'Address client feedback and fix reported issues.',
        tasks: [
          { title: 'Fix reported bugs', description: 'Address all issues from client review', priority: 'high' },
          { title: 'Implement content changes', description: 'Apply text and image updates', priority: 'medium' },
          { title: 'Final QA pass', description: 'Re-test all fixed issues', priority: 'medium' },
        ],
      },
      {
        name: 'Content Migration',
        duration_days: 3,
        type: 'Content',
        is_milestone: false,
        description: 'Migrate and finalize all content on the site.',
        tasks: [
          { title: 'Migrate content', description: 'Move all finalized content into CMS', priority: 'high' },
          { title: 'Optimize images', description: 'Compress and properly size all images', priority: 'medium' },
          { title: 'Set up SEO', description: 'Configure meta titles, descriptions, and OG tags', priority: 'medium' },
        ],
      },
      {
        name: 'Launch Preparation',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Final checks and DNS/hosting preparation.',
        tasks: [
          { title: 'Configure DNS', description: 'Point domain to hosting and verify SSL', priority: 'high' },
          { title: 'Set up redirects', description: 'Configure 301 redirects from old URLs', priority: 'high' },
          { title: 'Launch checklist review', description: 'Final walkthrough of all launch items', priority: 'medium' },
        ],
      },
      {
        name: 'Go Live',
        duration_days: 1,
        type: 'Timeline',
        is_milestone: true,
        description: 'Site goes live on production.',
        tasks: [
          { title: 'Deploy to production', description: 'Push final build to production hosting', priority: 'high' },
          { title: 'Verify live site', description: 'Test all pages and functionality on live URL', priority: 'high' },
          { title: 'Notify client of launch', description: 'Send launch confirmation to all stakeholders', priority: 'medium' },
        ],
      },
      {
        name: 'Post-Launch Support',
        duration_days: 5,
        type: 'General',
        is_milestone: false,
        description: 'Monitor site performance and address post-launch issues.',
        tasks: [
          { title: 'Monitor analytics', description: 'Review traffic and performance metrics', priority: 'medium' },
          { title: 'Address post-launch issues', description: 'Fix any bugs reported after launch', priority: 'high' },
          { title: 'Hand off documentation', description: 'Provide CMS training and maintenance docs', priority: 'medium' },
        ],
      },
    ],
  },
  {
    id: 'print',
    label: 'Print',
    icon: 'lucide:printer',
    description: 'Print design, production, and delivery',
    milestones: [
      {
        name: 'Contract Signed',
        duration_days: 0,
        type: 'Timeline',
        is_milestone: true,
        description: 'Project kickoff and contract execution.',
        tasks: [
          { title: 'Send signed contract', description: 'Ensure all parties have executed copies', priority: 'high' },
          { title: 'Gather print specifications', description: 'Confirm size, paper stock, quantities, finishes', priority: 'high' },
        ],
      },
      {
        name: 'Creative Brief',
        duration_days: 3,
        type: 'General',
        is_milestone: false,
        description: 'Define creative direction and project requirements.',
        tasks: [
          { title: 'Draft creative brief', description: 'Document objectives, audience, messaging, specs', priority: 'high' },
          { title: 'Gather brand assets', description: 'Collect logos, fonts, brand guidelines', priority: 'high' },
          { title: 'Get brief approval', description: 'Client sign-off on creative direction', priority: 'medium' },
        ],
      },
      {
        name: 'Design Concepts - Round 1',
        duration_days: 5,
        type: 'Design',
        is_milestone: false,
        description: 'Initial design concept exploration.',
        tasks: [
          { title: 'Research and inspiration', description: 'Gather reference materials and inspiration', priority: 'medium' },
          { title: 'Create design concepts', description: 'Develop 2-3 distinct design directions', priority: 'high' },
          { title: 'Prepare presentation', description: 'Mock up designs in context for client review', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 1',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews design concepts.',
        tasks: [
          { title: 'Present concepts', description: 'Walk client through design options', priority: 'high' },
          { title: 'Document feedback', description: 'Record all revision requests', priority: 'high' },
        ],
      },
      {
        name: 'Design Revisions - Round 2',
        duration_days: 3,
        type: 'Design',
        is_milestone: false,
        description: 'Refine design based on client feedback.',
        tasks: [
          { title: 'Apply revisions', description: 'Implement all client feedback', priority: 'high' },
          { title: 'Finalize layout', description: 'Lock down final design layout', priority: 'high' },
          { title: 'Copywriting integration', description: 'Place final copy into design', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 2',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Client reviews revised design.',
        tasks: [
          { title: 'Present revised design', description: 'Share updated design for approval', priority: 'high' },
          { title: 'Get design approval', description: 'Obtain final sign-off on design', priority: 'high' },
        ],
      },
      {
        name: 'Final Design Approval',
        duration_days: 1,
        type: 'Timeline',
        is_milestone: true,
        description: 'Final sign-off on design before print preparation.',
        tasks: [
          { title: 'Send final approval form', description: 'Get written sign-off that design is approved', priority: 'high' },
        ],
      },
      {
        name: 'Print-Ready File Preparation',
        duration_days: 2,
        type: 'Design',
        is_milestone: false,
        description: 'Prepare files for print production.',
        tasks: [
          { title: 'Prepare print-ready files', description: 'Set up bleeds, marks, CMYK color', priority: 'high' },
          { title: 'Preflight check', description: 'Verify resolution, fonts, and color profiles', priority: 'high' },
          { title: 'Create print specification sheet', description: 'Document paper, finish, binding specs', priority: 'medium' },
        ],
      },
      {
        name: 'Proof Review',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Review print proof for quality and accuracy.',
        tasks: [
          { title: 'Review digital proof', description: 'Check proof for errors and color accuracy', priority: 'high' },
          { title: 'Client proof approval', description: 'Get client sign-off on proof', priority: 'high' },
        ],
      },
      {
        name: 'Print Production',
        duration_days: 7,
        type: 'General',
        is_milestone: false,
        description: 'Production at print facility.',
        tasks: [
          { title: 'Send to print', description: 'Submit final files to print vendor', priority: 'high' },
          { title: 'Monitor production', description: 'Check in with vendor on timeline and quality', priority: 'medium' },
          { title: 'Press check (if applicable)', description: 'On-site quality check during print run', priority: 'low' },
        ],
      },
      {
        name: 'Quality Check',
        duration_days: 1,
        type: 'General',
        is_milestone: false,
        description: 'Inspect finished print pieces for quality.',
        tasks: [
          { title: 'Inspect printed materials', description: 'Check color, registration, trim, binding quality', priority: 'high' },
          { title: 'Document any issues', description: 'Note any quality concerns for vendor', priority: 'medium' },
        ],
      },
      {
        name: 'Delivery / Distribution',
        duration_days: 2,
        type: 'Timeline',
        is_milestone: true,
        description: 'Deliver finished materials to client.',
        tasks: [
          { title: 'Coordinate delivery', description: 'Arrange shipping or pickup of materials', priority: 'high' },
          { title: 'Confirm receipt', description: 'Verify client received all materials', priority: 'high' },
          { title: 'Archive source files', description: 'Store print-ready files for future reprints', priority: 'low' },
        ],
      },
    ],
  },
  {
    id: 'campaign',
    label: 'Campaign',
    icon: 'lucide:megaphone',
    description: 'Marketing campaign strategy, creative, and execution',
    milestones: [
      {
        name: 'Contract Signed',
        duration_days: 0,
        type: 'Timeline',
        is_milestone: true,
        description: 'Project kickoff and contract execution.',
        tasks: [
          { title: 'Send signed contract', description: 'Ensure all parties have executed copies', priority: 'high' },
          { title: 'Set up project workspace', description: 'Create shared folders and communication channels', priority: 'medium' },
        ],
      },
      {
        name: 'Strategy & Planning',
        duration_days: 5,
        type: 'General',
        is_milestone: false,
        description: 'Define campaign strategy, goals, and KPIs.',
        tasks: [
          { title: 'Define campaign objectives', description: 'Establish measurable goals and KPIs', priority: 'high' },
          { title: 'Audience segmentation', description: 'Define target audience segments and personas', priority: 'high' },
          { title: 'Channel strategy', description: 'Determine which channels to activate', priority: 'high' },
          { title: 'Budget allocation', description: 'Plan budget across channels and phases', priority: 'medium' },
        ],
      },
      {
        name: 'Creative Brief',
        duration_days: 3,
        type: 'Content',
        is_milestone: false,
        description: 'Develop the creative brief and messaging framework.',
        tasks: [
          { title: 'Draft creative brief', description: 'Document messaging, tone, visual direction', priority: 'high' },
          { title: 'Develop key messages', description: 'Create primary and secondary messaging', priority: 'high' },
          { title: 'Get brief approval', description: 'Client sign-off on creative direction', priority: 'medium' },
        ],
      },
      {
        name: 'Asset Design - Round 1',
        duration_days: 7,
        type: 'Design',
        is_milestone: false,
        description: 'Design campaign assets across all channels.',
        tasks: [
          { title: 'Design primary ad creative', description: 'Create hero visuals for the campaign', priority: 'high' },
          { title: 'Adapt for channels', description: 'Create size variations for each platform', priority: 'high' },
          { title: 'Write ad copy', description: 'Draft headlines and body copy for each asset', priority: 'high' },
          { title: 'Create landing page design', description: 'Design campaign-specific landing page', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 1',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews campaign creative assets.',
        tasks: [
          { title: 'Present campaign creative', description: 'Walk through all assets and rationale', priority: 'high' },
          { title: 'Document feedback', description: 'Record all revision requests per asset', priority: 'high' },
        ],
      },
      {
        name: 'Asset Revisions - Round 2',
        duration_days: 4,
        type: 'Design',
        is_milestone: false,
        description: 'Revise assets based on client feedback.',
        tasks: [
          { title: 'Apply revisions', description: 'Implement client feedback on all assets', priority: 'high' },
          { title: 'Finalize ad copy', description: 'Lock down final messaging', priority: 'high' },
          { title: 'Final asset QA', description: 'Verify all specs, sizes, and formats', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 2',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Final review and approval of campaign assets.',
        tasks: [
          { title: 'Present final assets', description: 'Share revised creative for approval', priority: 'high' },
          { title: 'Get final approval', description: 'Obtain sign-off on all campaign materials', priority: 'high' },
        ],
      },
      {
        name: 'Campaign Setup',
        duration_days: 3,
        type: 'General',
        is_milestone: false,
        description: 'Set up campaign in ad platforms and prepare launch.',
        tasks: [
          { title: 'Set up ad accounts', description: 'Configure campaigns in ad platforms', priority: 'high' },
          { title: 'Upload assets', description: 'Load creative and copy into platforms', priority: 'high' },
          { title: 'Configure targeting', description: 'Set up audience targeting and budgets', priority: 'high' },
          { title: 'Set up tracking', description: 'Install pixels, UTM parameters, conversion tracking', priority: 'medium' },
        ],
      },
      {
        name: 'Campaign Launch',
        duration_days: 1,
        type: 'Timeline',
        is_milestone: true,
        description: 'Campaign goes live across all channels.',
        tasks: [
          { title: 'Launch campaigns', description: 'Activate all campaigns and verify delivery', priority: 'high' },
          { title: 'Verify tracking', description: 'Confirm all tracking and analytics working', priority: 'high' },
          { title: 'Notify client of launch', description: 'Send launch confirmation to stakeholders', priority: 'medium' },
        ],
      },
      {
        name: 'Monitoring & Optimization',
        duration_days: 14,
        type: 'General',
        is_milestone: false,
        description: 'Active campaign monitoring and performance optimization.',
        tasks: [
          { title: 'Daily performance monitoring', description: 'Monitor key metrics and spend pacing', priority: 'high' },
          { title: 'A/B testing', description: 'Test creative and copy variations', priority: 'medium' },
          { title: 'Budget optimization', description: 'Reallocate budget to top performers', priority: 'medium' },
          { title: 'Weekly performance updates', description: 'Send brief performance summaries', priority: 'low' },
        ],
      },
      {
        name: 'Mid-Campaign Report',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Provide mid-campaign performance analysis and recommendations.',
        tasks: [
          { title: 'Compile performance data', description: 'Pull metrics from all channels', priority: 'high' },
          { title: 'Analyze results', description: 'Identify trends and optimization opportunities', priority: 'high' },
          { title: 'Present mid-campaign report', description: 'Share findings and recommendations with client', priority: 'medium' },
        ],
      },
      {
        name: 'Campaign Wrap-Up Report',
        duration_days: 3,
        type: 'Timeline',
        is_milestone: true,
        description: 'Final campaign performance report and learnings.',
        tasks: [
          { title: 'Compile final metrics', description: 'Gather all performance data across channels', priority: 'high' },
          { title: 'Create final report', description: 'Build comprehensive performance report with ROI', priority: 'high' },
          { title: 'Document learnings', description: 'Record key insights for future campaigns', priority: 'medium' },
          { title: 'Present to client', description: 'Present results and recommendations', priority: 'medium' },
        ],
      },
    ],
  },
  {
    id: 'photo-video',
    label: 'Photo / Video',
    icon: 'lucide:camera',
    description: 'Photography and video production',
    milestones: [
      {
        name: 'Contract Signed',
        duration_days: 0,
        type: 'Timeline',
        is_milestone: true,
        description: 'Project kickoff and contract execution.',
        tasks: [
          { title: 'Send signed contract', description: 'Ensure all parties have executed copies', priority: 'high' },
          { title: 'Set up project workspace', description: 'Create shared folders and communication channels', priority: 'medium' },
        ],
      },
      {
        name: 'Pre-Production Planning',
        duration_days: 5,
        type: 'General',
        is_milestone: false,
        description: 'Plan the production — logistics, talent, locations.',
        tasks: [
          { title: 'Define production scope', description: 'Confirm deliverables, usage, and timeline', priority: 'high' },
          { title: 'Scout locations', description: 'Research and scout potential shoot locations', priority: 'high' },
          { title: 'Source talent/models', description: 'Cast models or book talent as needed', priority: 'medium' },
          { title: 'Arrange equipment', description: 'Book rental gear and confirm crew', priority: 'medium' },
        ],
      },
      {
        name: 'Shot List / Storyboard',
        duration_days: 3,
        type: 'Content',
        is_milestone: false,
        description: 'Create detailed shot list or storyboard.',
        tasks: [
          { title: 'Draft shot list', description: 'List all required shots with descriptions', priority: 'high' },
          { title: 'Create storyboards (video)', description: 'Sketch key frames and transitions', priority: 'medium' },
          { title: 'Plan shoot schedule', description: 'Organize shots by location and timing', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Plan',
        duration_days: 2,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews and approves production plan.',
        tasks: [
          { title: 'Present shot list and plan', description: 'Review production plan with client', priority: 'high' },
          { title: 'Get plan approval', description: 'Obtain sign-off on production approach', priority: 'high' },
        ],
      },
      {
        name: 'Shoot Day(s)',
        duration_days: 2,
        type: 'General',
        is_milestone: true,
        description: 'Execute the photo or video shoot.',
        tasks: [
          { title: 'Setup and prep', description: 'Set up lighting, equipment, and styling', priority: 'high' },
          { title: 'Execute shoot', description: 'Capture all shots per shot list', priority: 'high' },
          { title: 'Review shots on-set', description: 'Quick review of captures during shoot', priority: 'medium' },
          { title: 'Wrap and backup', description: 'Break down set and backup all footage/photos', priority: 'high' },
        ],
      },
      {
        name: 'Post-Production - Round 1',
        duration_days: 6,
        type: 'Design',
        is_milestone: false,
        description: 'Edit, color correct, and process captured content.',
        tasks: [
          { title: 'Cull and select', description: 'Review all captures and select best shots', priority: 'high' },
          { title: 'Edit and retouch', description: 'Process selected images/footage', priority: 'high' },
          { title: 'Color grading', description: 'Apply consistent color treatment', priority: 'medium' },
          { title: 'Audio mix (video)', description: 'Clean up audio and add music/SFX', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 1',
        duration_days: 3,
        type: 'General',
        is_milestone: true,
        description: 'Client reviews first round of edited content.',
        tasks: [
          { title: 'Deliver proofs/rough cut', description: 'Share edited content for review', priority: 'high' },
          { title: 'Collect feedback', description: 'Document all revision requests', priority: 'high' },
        ],
      },
      {
        name: 'Post-Production - Round 2',
        duration_days: 3,
        type: 'Design',
        is_milestone: false,
        description: 'Apply client feedback and finalize edits.',
        tasks: [
          { title: 'Apply revisions', description: 'Implement client feedback on all assets', priority: 'high' },
          { title: 'Final polish', description: 'Fine-tune exposure, color, and details', priority: 'medium' },
        ],
      },
      {
        name: 'Client Review - Round 2',
        duration_days: 2,
        type: 'General',
        is_milestone: false,
        description: 'Client reviews final edits.',
        tasks: [
          { title: 'Present final edits', description: 'Share revised content for final approval', priority: 'high' },
          { title: 'Get final approval', description: 'Obtain sign-off on deliverables', priority: 'high' },
        ],
      },
      {
        name: 'Final Delivery',
        duration_days: 2,
        type: 'Timeline',
        is_milestone: true,
        description: 'Deliver final files in all required formats.',
        tasks: [
          { title: 'Export deliverables', description: 'Export files in all required formats and sizes', priority: 'high' },
          { title: 'Organize and deliver', description: 'Structure files in folders and deliver to client', priority: 'high' },
          { title: 'Archive project files', description: 'Store RAW files and source projects', priority: 'low' },
        ],
      },
    ],
  },
];
