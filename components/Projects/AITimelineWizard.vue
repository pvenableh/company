<template>
  <Transition name="fade">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <Transition name="scale-up" appear>
        <div class="bg-background rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden border max-h-[90vh] flex flex-col">
          <!-- Header -->
          <div class="relative px-6 pt-6 pb-4 shrink-0">
            <button
              class="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              @click="$emit('close')"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>

            <div class="flex items-center gap-3 mb-1">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Icon name="lucide:sparkles" class="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-foreground">AI Timeline Generator</h2>
                <p class="text-xs text-muted-foreground">Generate a project timeline with milestones and tasks</p>
              </div>
            </div>

            <!-- Step indicators -->
            <div v-if="step < 3 || saving" class="flex items-center gap-2 mt-4">
              <div
                v-for="s in 3"
                :key="s"
                class="flex-1 h-1 rounded-full transition-all duration-500"
                :class="s <= step ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-muted'"
              />
            </div>
          </div>

          <!-- Step 1: Project Setup -->
          <div v-if="step === 1" class="px-6 pb-6 overflow-y-auto">
            <div class="space-y-5">
              <!-- Service info -->
              <div v-if="project.service?.name" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border">
                <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: project.service.color || '#808080' }" />
                <span class="text-sm font-medium text-foreground">{{ project.service.name }}</span>
                <span v-if="form.projectType !== 'custom'" class="text-xs text-muted-foreground ml-auto">
                  Matched to {{ projectTypes.find(t => t.id === form.projectType)?.label }} template
                </span>
                <span v-else class="text-xs text-muted-foreground ml-auto">AI will generate from scratch</span>
              </div>

              <!-- Project type -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Timeline template</label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    v-for="t in projectTypes"
                    :key="t.id"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.projectType === t.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.projectType = t.id"
                  >
                    <Icon :name="t.icon" class="w-5 h-5" :class="form.projectType === t.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.projectType === t.id ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Scope -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Project scope</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="s in scopes"
                    :key="s.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.scope === s.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.scope = s.value"
                  >
                    <Icon :name="s.icon" class="w-5 h-5" :class="form.scope === s.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.scope === s.value ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">{{ s.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Client type -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Client type</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="c in clientTypes"
                    :key="c.value"
                    class="flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all"
                    :class="form.clientType === c.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.clientType = c.value"
                  >
                    <Icon :name="c.icon" class="w-5 h-5" :class="form.clientType === c.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'" />
                    <span class="text-sm font-medium" :class="form.clientType === c.value ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">{{ c.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Dates -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium text-foreground mb-1.5 block">Start date</label>
                  <input
                    v-model="form.startDate"
                    type="date"
                    class="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label class="text-sm font-medium text-foreground mb-1.5 block">
                    Target deadline
                    <span class="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    v-model="form.targetDeadline"
                    type="date"
                    class="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <!-- Special requirements -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">
                  Special requirements
                  <span class="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  v-model="form.specialRequirements"
                  rows="2"
                  placeholder="e.g. Needs accessibility audit, multi-language support, rush delivery..."
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div class="flex justify-end mt-6">
              <Button
                :disabled="!form.projectType || !form.startDate || (form.projectType === 'custom' && !project.service?.name)"
                class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 shadow-lg shadow-emerald-500/20 px-6"
                @click="generateTimeline"
              >
                Generate Timeline
                <Icon name="lucide:sparkles" class="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          <!-- Step 2: Customize Timeline -->
          <div v-if="step === 2" class="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
            <!-- Loading state -->
            <div v-if="generating" class="py-12 text-center">
              <div class="relative w-16 h-16 mx-auto mb-6">
                <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 animate-pulse opacity-30" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <Icon name="lucide:sparkles" class="w-7 h-7 text-emerald-600 dark:text-emerald-400 animate-bounce" />
                </div>
              </div>
              <h3 class="font-semibold text-foreground mb-1">Generating your timeline...</h3>
              <p class="text-sm text-muted-foreground max-w-xs mx-auto">
                Analyzing project requirements and building a custom timeline with tasks
              </p>
              <div class="flex justify-center gap-1 mt-4">
                <div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
              </div>
            </div>

            <!-- Error state -->
            <div v-else-if="error" class="py-8 text-center">
              <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Icon name="lucide:alert-circle" class="w-6 h-6 text-destructive" />
              </div>
              <h3 class="font-semibold text-foreground mb-1">Generation failed</h3>
              <p class="text-sm text-muted-foreground mb-4">{{ error }}</p>
              <div class="flex justify-center gap-2">
                <Button variant="outline" @click="step = 1">
                  <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
                  Go Back
                </Button>
                <Button
                  class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
                  @click="generateTimeline"
                >
                  <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
                  Try Again
                </Button>
              </div>
            </div>

            <!-- Timeline editor -->
            <div v-else-if="proposedEvents.length > 0" class="space-y-3">
              <!-- AI Summary -->
              <div v-if="aiSummary" class="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 p-3 flex items-start gap-2">
                <Icon name="lucide:sparkles" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p class="text-xs text-emerald-800 dark:text-emerald-300">{{ aiSummary }}</p>
              </div>

              <!-- Stats bar -->
              <div class="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{{ enabledEvents.length }} events</span>
                <span>{{ totalTasks }} tasks</span>
                <span>{{ totalMilestones }} milestones</span>
                <span>{{ totalDays }} days</span>
              </div>

              <!-- Event list -->
              <div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                <div
                  v-for="(evt, i) in proposedEvents"
                  :key="evt.id"
                  class="group rounded-xl border bg-card transition-all"
                  :class="evt.enabled ? 'hover:shadow-sm' : 'opacity-50'"
                >
                  <!-- Event header -->
                  <div class="flex items-start gap-3 p-3">
                    <!-- Toggle -->
                    <button
                      class="mt-1 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                      :class="evt.enabled
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-muted-foreground/30 hover:border-muted-foreground/50'"
                      @click="evt.enabled = !evt.enabled"
                    >
                      <Icon v-if="evt.enabled" name="lucide:check" class="w-3 h-3" />
                    </button>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <!-- Sort number -->
                        <span class="text-[10px] font-bold text-muted-foreground w-5 text-center shrink-0">{{ evt.sort }}</span>

                        <!-- Editable title -->
                        <input
                          v-model="evt.title"
                          class="flex-1 text-sm font-semibold bg-transparent border-0 outline-none text-foreground min-w-0"
                          :disabled="!evt.enabled"
                        />

                        <!-- Type badge -->
                        <span
                          class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          :class="getTypeBadgeStyle(evt.type)"
                        >
                          {{ evt.type }}
                        </span>

                        <!-- Milestone toggle -->
                        <button
                          class="shrink-0 transition-colors"
                          :class="evt.is_milestone ? 'text-amber-500' : 'text-muted-foreground/30 hover:text-muted-foreground'"
                          @click="evt.is_milestone = !evt.is_milestone"
                          title="Toggle milestone"
                        >
                          <Icon name="lucide:diamond" class="w-4 h-4" />
                        </button>

                        <!-- Delete -->
                        <button
                          class="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          @click="removeEvent(i)"
                        >
                          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div class="flex items-center gap-3 text-xs text-muted-foreground">
                        <span class="flex items-center gap-1">
                          <Icon name="lucide:calendar" class="w-3 h-3" />
                          {{ formatDate(evt.event_date) }}
                        </span>
                        <span v-if="evt.duration_days > 0" class="flex items-center gap-1">
                          <Icon name="lucide:clock" class="w-3 h-3" />
                          {{ evt.duration_days }}d
                        </span>
                        <span v-if="evt.end_date !== evt.event_date" class="flex items-center gap-1">
                          <Icon name="lucide:arrow-right" class="w-3 h-3" />
                          {{ formatDate(evt.end_date) }}
                        </span>
                      </div>

                      <!-- Tasks expandable -->
                      <div v-if="evt.tasks.length > 0" class="mt-2">
                        <button
                          class="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          @click="toggleExpanded(evt.id)"
                        >
                          <Icon
                            name="lucide:chevron-right"
                            class="w-3 h-3 transition-transform"
                            :class="expandedEvents.has(evt.id) ? 'rotate-90' : ''"
                          />
                          {{ evt.tasks.length }} task{{ evt.tasks.length !== 1 ? 's' : '' }}
                        </button>

                        <div v-if="expandedEvents.has(evt.id)" class="mt-1.5 space-y-1 ml-4">
                          <div
                            v-for="(task, j) in evt.tasks"
                            :key="task.id"
                            class="flex items-center gap-2 text-xs group/task"
                          >
                            <span class="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                            <input
                              v-model="task.title"
                              class="flex-1 bg-transparent border-0 outline-none text-foreground min-w-0"
                            />
                            <span
                              class="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                              :class="getPriorityStyle(task.priority)"
                            >
                              {{ task.priority }}
                            </span>
                            <button
                              class="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover/task:opacity-100"
                              @click="evt.tasks.splice(j, 1)"
                            >
                              <Icon name="lucide:x" class="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1"
                            @click="addTask(evt)"
                          >
                            <Icon name="lucide:plus" class="w-3 h-3" />
                            Add task
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Add event button -->
                <button
                  class="w-full py-2.5 rounded-xl border-2 border-dashed border-muted-foreground/20 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors flex items-center justify-center gap-1"
                  @click="addEvent"
                >
                  <Icon name="lucide:plus" class="w-4 h-4" />
                  Add Event
                </button>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-3 border-t">
                <div class="flex gap-2">
                  <Button variant="ghost" size="sm" @click="step = 1">
                    <Icon name="lucide:arrow-left" class="w-3.5 h-3.5 mr-1" />
                    Back
                  </Button>
                  <Button variant="ghost" size="sm" @click="generateTimeline">
                    <Icon name="lucide:refresh-cw" class="w-3.5 h-3.5 mr-1" />
                    Regenerate
                  </Button>
                </div>
                <Button
                  :disabled="enabledEvents.length === 0"
                  class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 shadow-lg shadow-emerald-500/20 px-6"
                  @click="step = 3"
                >
                  Review & Create
                  <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Step 3: Review & Create -->
          <div v-if="step === 3" class="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
            <!-- Saving state -->
            <div v-if="saving" class="py-12 text-center">
              <div class="relative w-16 h-16 mx-auto mb-6">
                <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 animate-pulse opacity-30" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <Icon name="lucide:loader-2" class="w-7 h-7 text-emerald-600 dark:text-emerald-400 animate-spin" />
                </div>
              </div>
              <h3 class="font-semibold text-foreground mb-1">Creating events & tasks...</h3>
              <p class="text-sm text-muted-foreground">Saving {{ enabledEvents.length }} events and {{ totalTasks }} tasks</p>
            </div>

            <div v-else class="space-y-4">
              <!-- Summary card -->
              <div class="rounded-xl border bg-muted/30 p-4">
                <h3 class="text-sm font-semibold text-foreground mb-3">Timeline Summary</h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="text-center">
                    <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ enabledEvents.length }}</div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Events</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-teal-600 dark:text-teal-400">{{ totalTasks }}</div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Tasks</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ totalMilestones }}</div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Milestones</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-foreground">{{ totalDays }}</div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Days</div>
                  </div>
                </div>
                <div v-if="enabledEvents.length > 0" class="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
                  {{ formatDate(enabledEvents[0].event_date) }} — {{ formatDate(enabledEvents[enabledEvents.length - 1].end_date) }}
                </div>
              </div>

              <!-- Compact event list -->
              <div class="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                <div
                  v-for="evt in enabledEvents"
                  :key="evt.id"
                  class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <Icon
                    v-if="evt.is_milestone"
                    name="lucide:diamond"
                    class="w-3.5 h-3.5 text-amber-500 shrink-0"
                  />
                  <span v-else class="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  </span>
                  <span class="text-sm text-foreground flex-1 min-w-0 truncate">{{ evt.title }}</span>
                  <span class="text-xs text-muted-foreground shrink-0">{{ formatDate(evt.event_date) }}</span>
                  <span class="text-[10px] text-muted-foreground shrink-0">{{ evt.tasks.length }} tasks</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-3 border-t">
                <Button variant="ghost" @click="step = 2">
                  <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button
                  class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 shadow-lg shadow-emerald-500/20 px-6"
                  @click="saveEvents"
                >
                  <Icon name="lucide:check" class="w-4 h-4 mr-1" />
                  Create {{ enabledEvents.length }} Events & {{ totalTasks }} Tasks
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { PROJECT_TEMPLATES, matchServiceToTemplate } from '~/types/projects/timeline-generator';
import type { ProposedEvent, ProposedTask } from '~/types/projects/timeline-generator';

const props = defineProps<{
  project: {
    id: string;
    title?: string | null;
    service?: { name?: string; color?: string } | null;
    start_date?: string | null;
    due_date?: string | null;
    template?: 'web-project' | 'branding-project' | null;
  };
}>();

const emit = defineEmits<{
  close: [];
  created: [count: number];
}>();

const toast = useToast();
const { selectedClient } = useClients();

// State
const step = ref(1);
const generating = ref(false);
const saving = ref(false);
const error = ref('');
const proposedEvents = ref<ProposedEvent[]>([]);
const aiSummary = ref('');
const expandedEvents = ref(new Set<string>());

// Auto-detect project type from template or service name
function detectProjectType(): string {
  if (props.project.template === 'web-project') return 'web-design';
  if (props.project.template === 'branding-project') return 'branding';
  if (props.project.service?.name) {
    const matched = matchServiceToTemplate(props.project.service.name);
    if (matched) return matched;
  }
  return 'custom';
}

// Auto-detect client type based on selected client in header
function detectClientType(): 'new' | 'returning' {
  return selectedClient.value ? 'returning' : 'new';
}

const form = reactive({
  projectType: detectProjectType(),
  scope: 'medium' as 'small' | 'medium' | 'large' | 'enterprise',
  clientType: detectClientType(),
  startDate: props.project.start_date || new Date().toISOString().split('T')[0],
  targetDeadline: props.project.due_date || '',
  specialRequirements: '',
  teamSize: 2,
});

// Options — 5 predefined templates + custom (AI from scratch)
const projectTypes = [
  ...PROJECT_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
  })),
  {
    id: 'custom',
    label: 'Custom',
    icon: 'lucide:wand-2',
  },
];

const scopes = [
  { value: 'small', label: 'Small', icon: 'lucide:minimize-2' },
  { value: 'medium', label: 'Medium', icon: 'lucide:minus' },
  { value: 'large', label: 'Large', icon: 'lucide:maximize-2' },
  { value: 'enterprise', label: 'Enterprise', icon: 'lucide:building-2' },
];

const clientTypes = [
  { value: 'new', label: 'New Client', icon: 'lucide:user-plus' },
  { value: 'returning', label: 'Returning Client', icon: 'lucide:user-check' },
];

// Computed
const enabledEvents = computed(() =>
  proposedEvents.value.filter((e) => e.enabled),
);

const totalTasks = computed(() =>
  enabledEvents.value.reduce((sum, e) => sum + e.tasks.length, 0),
);

const totalMilestones = computed(() =>
  enabledEvents.value.filter((e) => e.is_milestone).length,
);

const totalDays = computed(() => {
  const events = enabledEvents.value;
  if (events.length === 0) return 0;
  const first = new Date(events[0].event_date);
  const last = new Date(events[events.length - 1].end_date);
  return Math.max(0, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
});

// Actions
async function generateTimeline() {
  step.value = 2;
  generating.value = true;
  error.value = '';
  proposedEvents.value = [];
  aiSummary.value = '';

  try {
    const data = await $fetch('/api/projects/generate-events', {
      method: 'POST',
      body: {
        projectId: props.project.id,
        projectType: form.projectType,
        scope: form.scope,
        clientType: form.clientType,
        startDate: form.startDate,
        targetDeadline: form.targetDeadline || undefined,
        specialRequirements: form.specialRequirements || undefined,
        teamSize: form.teamSize,
        projectTitle: props.project.title || undefined,
        serviceName: props.project.service?.name || undefined,
      },
    });

    const result = data as any;
    proposedEvents.value = result.events;
    aiSummary.value = result.summary;
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Something went wrong. Please try again.';
  } finally {
    generating.value = false;
  }
}

async function saveEvents() {
  saving.value = true;

  try {
    const eventsToSave = enabledEvents.value.map((evt, i) => ({
      title: evt.title,
      description: evt.description,
      event_date: evt.event_date,
      end_date: evt.end_date,
      duration_days: evt.duration_days,
      type: evt.type,
      is_milestone: evt.is_milestone,
      sort: i + 1,
      tasks: evt.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        due_date: t.due_date,
      })),
    }));

    const result = await $fetch('/api/projects/save-events', {
      method: 'POST',
      body: {
        projectId: props.project.id,
        events: eventsToSave,
      },
    }) as any;

    toast.add({
      title: 'Timeline Created',
      description: `Created ${result.eventsCreated} events and ${result.tasksCreated} tasks`,
      color: 'green',
    });

    emit('created', result.eventsCreated);
    emit('close');
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to save events.';
    toast.add({
      title: 'Error',
      description: error.value,
      color: 'red',
    });
    saving.value = false;
  }
}

function removeEvent(index: number) {
  proposedEvents.value.splice(index, 1);
  // Re-sort remaining events
  proposedEvents.value.forEach((evt, i) => {
    evt.sort = i + 1;
  });
}

function addEvent() {
  const lastEvent = proposedEvents.value[proposedEvents.value.length - 1];
  const newDate = lastEvent?.end_date || form.startDate;

  proposedEvents.value.push({
    id: `evt_custom_${Date.now()}`,
    title: 'New Event',
    description: '',
    event_date: newDate,
    end_date: newDate,
    duration_days: 1,
    type: 'General',
    is_milestone: false,
    enabled: true,
    sort: proposedEvents.value.length + 1,
    tasks: [],
  });
}

function addTask(evt: ProposedEvent) {
  evt.tasks.push({
    id: `task_custom_${Date.now()}`,
    title: 'New task',
    description: '',
    priority: 'medium',
    due_date: evt.end_date,
  });
}

function toggleExpanded(eventId: string) {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId);
  } else {
    expandedEvents.value.add(eventId);
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTypeBadgeStyle(type: string): string {
  const styles: Record<string, string> = {
    General: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    Design: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    Content: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Timeline: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    Financial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Hours: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  };
  return styles[type] || styles.General;
}

function getPriorityStyle(priority: string): string {
  const styles: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    medium: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    high: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  };
  return styles[priority] || styles.medium;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-up-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.scale-up-leave-active {
  transition: all 0.2s ease;
}
.scale-up-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(10px);
}
.scale-up-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
