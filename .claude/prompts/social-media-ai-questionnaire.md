# Social Media AI Content Questionnaire

## Goal
Add an AI-powered content generation wizard to the social media system. Users answer a few questions, then Claude generates platform-optimized posts with copy, hashtags, and image suggestions — similar to the AI email wizard in the email template builder.

## Context
- The app has social media adapters for LinkedIn, Facebook, and Threads (see `composables/useSocial*.ts` and `server/api/social/`)
- There's an existing LLM infrastructure: `server/utils/llm/factory.ts` with `getLLMProvider()` returning a Claude provider
- The email AI wizard (`components/Newsletter/AIEmailWizard.vue` + `server/api/email/ai-generate.post.ts`) is a good reference for the pattern
- Each platform has different constraints (character limits, hashtag behavior, link previews, image aspect ratios)

## Requirements

### AI Questionnaire Flow (3-step wizard modal)

**Step 1 — "What do you want to share?"**
- Platform selector: LinkedIn, Facebook, Threads, Instagram (multi-select for cross-posting)
- Content type quick-picks: Announcement, Behind-the-scenes, Promotion/Sale, Thought Leadership, Event, Case Study, Team Spotlight, Industry News
- Topic/description textarea: "Tell us what you want to say..."
- Optional: Key points or must-include info

**Step 2 — "Tone and style"**
- Tone selector: Professional, Casual/Friendly, Playful/Fun, Urgent/Exciting, Inspirational
- Audience: Clients, Prospects, Industry Peers, General Public, Team/Internal
- Optional: Brand voice notes (free text)
- Optional: Include call-to-action? (toggle + CTA type: Visit website, Book a call, Learn more, Shop now)

**Step 3 — "Review and publish"**
- Show generated content per platform (each adapted for that platform's style/limits)
- Editable text fields for each platform variant
- Suggested hashtags (editable, with add/remove)
- Image suggestion description + search terms
- "Create Posts" button → creates draft social posts
- "Regenerate" button → try again with same inputs

### Server Endpoint — `server/api/social/ai-generate.post.ts`
- Authenticated endpoint using `getUserDirectus(event)`
- Accepts: `{ platforms[], contentType, topic, keyPoints, tone, audience, brandVoice?, ctaType? }`
- Builds a system prompt with platform-specific constraints:
  - LinkedIn: Professional tone, 3000 char limit, hashtags at bottom, mention formatting
  - Facebook: Conversational, emoji-friendly, link previews, longer form OK
  - Threads: Short-form, conversational, 500 char limit, hashtag-light
  - Instagram: Caption-style, hashtag-heavy (up to 30), emoji-rich
- Returns: `{ posts: [{ platform, content, hashtags[], cta?, imageSuggestion: { description, searchTerms } }] }`
- Uses `getLLMProvider()` → `provider.chat()` (non-streaming, JSON response)

### Integration Points
- Add "AI Generate" button to the social media compose/create flow
- When posts are created from AI, they should go into draft status for review
- If the social media page has a compose modal, add the wizard as an option there
- Explore existing social media pages/components first to find the right integration point

### Platform-Specific Considerations
- LinkedIn posts should feel professional, include relevant industry context
- Facebook posts can be longer, more conversational, include questions to drive engagement
- Threads posts should be punchy, short-form, thread-friendly (suggest thread breakpoints for longer content)
- All platforms: suggest optimal posting times based on content type

## Technical Notes
- Reuse `getLLMProvider()` from `server/utils/llm/factory.ts`
- Follow the same auth pattern as `server/api/email/ai-generate.post.ts`
- Use shadcn-vue components, Lucide icons, Tailwind CSS v4 for UI
- Check existing social media composables and pages before building to understand current data model
