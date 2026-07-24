<script setup lang="ts">
/**
 * SocialCalendarSurface — body of the legacy /social/calendar page,
 * extracted so Studio's `?view=calendar` sub-view can mount it without
 * leaving the Marketing app shell. The legacy /social/calendar route
 * now redirects to Studio.
 */
import { Button } from '~/components/ui/button';
import { CalendarDate, DateFormatter, getLocalTimeZone, today } from '@internationalized/date';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, addMonths, subMonths } from 'date-fns';
import type { SocialPost, SocialAccountPublic } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

const toast = useToast();
const router = useRouter();

const currentDate = ref(today(getLocalTimeZone()));
const currentMonth = computed(() => new Date(currentDate.value.year, currentDate.value.month - 1, 1));

const selectedClientId = ref<string | null>(null);
const selectedPlatform = ref<string | null>(null);
const selectedStatus = ref<string | null>(null);

const { clientList: clients } = useClients();
const { data: accountsData } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);

const monthStart = computed(() => format(startOfMonth(currentMonth.value), 'yyyy-MM-dd'));
const monthEnd = computed(() => format(endOfMonth(currentMonth.value), 'yyyy-MM-dd'));

const { data: postsData, refresh: refreshPosts } = useLazyFetch('/api/social/posts', {
  query: {
    scheduled_after: computed(() => `${monthStart.value}T00:00:00Z`),
    scheduled_before: computed(() => `${monthEnd.value}T23:59:59Z`),
    limit: 100,
  },
  watch: [monthStart, monthEnd],
});

const posts = computed(() => ((postsData.value as any)?.data || []) as SocialPost[]);

const filteredPosts = computed(() => {
  let result = posts.value;
  if (selectedClientId.value) {
    const wantedClient = selectedClientId.value === 'house' ? null : selectedClientId.value;
    const clientAccountIds = accounts.value
      .filter((a) => a.client === wantedClient)
      .map((a) => a.id);
    result = result.filter((p) => p.platforms.some((t) => clientAccountIds.includes(t.account_id)));
  }
  if (selectedPlatform.value) {
    result = result.filter((p) => p.platforms.some((t) => t.platform === selectedPlatform.value));
  }
  if (selectedStatus.value) {
    result = result.filter((p) => p.status === selectedStatus.value);
  }
  return result;
});

const postsByDate = computed(() => {
  const grouped: Record<string, SocialPost[]> = {};
  for (const post of filteredPosts.value) {
    const dateKey = format(parseISO(post.scheduled_at), 'yyyy-MM-dd');
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(post);
  }
  return grouped;
});

const calendarDays = computed(() => {
  const start = startOfMonth(currentMonth.value);
  const end = endOfMonth(currentMonth.value);
  const days = eachDayOfInterval({ start, end });
  const startDay = start.getDay();
  const padStart = Array(startDay).fill(null);
  const endDay = end.getDay();
  const padEnd = Array(6 - endDay).fill(null);
  return [...padStart, ...days, ...padEnd];
});

function previousMonth() {
  const prev = subMonths(currentMonth.value, 1);
  currentDate.value = new CalendarDate(prev.getFullYear(), prev.getMonth() + 1, 1);
}
function nextMonth() {
  const next = addMonths(currentMonth.value, 1);
  currentDate.value = new CalendarDate(next.getFullYear(), next.getMonth() + 1, 1);
}
function goToToday() {
  currentDate.value = today(getLocalTimeZone());
}

const selectedPost = ref<SocialPost | null>(null);
const showPostModal = ref(false);
const isDeleting = ref(false);

function openPost(post: SocialPost) {
  selectedPost.value = post;
  showPostModal.value = true;
}

async function deleteSelectedPost() {
  if (!selectedPost.value) return;
  if (!['draft', 'scheduled', 'failed'].includes(selectedPost.value.status)) {
    toast.add({
      title: 'Cannot delete',
      description: 'Posts that went live stay in your history. Delete from the platform directly to retract.',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
    return;
  }
  if (!confirm(`Delete this ${selectedPost.value.status} post? This cannot be undone.`)) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/social/posts/${selectedPost.value.id}`, { method: 'DELETE' });
    toast.add({ title: 'Post deleted', icon: 'i-lucide-check-circle', color: 'green' });
    showPostModal.value = false;
    selectedPost.value = null;
    await refreshPosts();
  } catch (error: any) {
    toast.add({
      title: 'Failed to delete',
      description: error.data?.message || error.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isDeleting.value = false;
  }
}

function getPostsForDay(date: Date) {
  const dateKey = format(date, 'yyyy-MM-dd');
  return postsByDate.value[dateKey] || [];
}

function isToday(date: Date) {
  return isSameDay(date, new Date());
}

const { getStatusBadgeClasses } = useStatusStyle();
const platformIcons = (p: string) => getSocialPlatformIcon(p);

const monthStats = computed(() => ({
  total: filteredPosts.value.length,
  scheduled: filteredPosts.value.filter((p) => p.status === 'scheduled').length,
  published: filteredPosts.value.filter((p) => p.status === 'published').length,
  failed: filteredPosts.value.filter((p) => p.status === 'failed').length,
}));

const df = new DateFormatter('en-US', { month: 'long', year: 'numeric' });

// Compose entry — navigates into the Composition Canvas with a
// create-mode social composer pre-opened. CalendarSurface isn't mounted
// inside the canvas tree on its own, so we use the URL helper.
function openCompose() {
  openCanvasCompose('social');
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-muted-foreground">{{ monthStats.total }} posts this month</p>
      <Button size="sm" @click="openCompose">
        <Icon name="lucide:pen-line" class="w-4 h-4 mr-1" />
        New Post
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <ESelectMenu
        v-model="selectedClientId"
        :options="[
          { label: 'All clients', value: null },
          { label: 'House', value: 'house' },
          ...clients.map((c) => ({ label: c.name, value: c.id })),
        ]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Filter by contact"
        class="w-40"
      />
      <ESelectMenu
        v-model="selectedPlatform"
        :options="[
          { label: 'All Platforms', value: null },
          { label: 'Instagram', value: 'instagram' },
          { label: 'TikTok', value: 'tiktok' },
        ]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Platform"
        class="w-36"
      />
      <ESelectMenu
        v-model="selectedStatus"
        :options="[
          { label: 'All Status', value: null },
          { label: 'Scheduled', value: 'scheduled' },
          { label: 'Published', value: 'published' },
          { label: 'Draft', value: 'draft' },
          { label: 'Failed', value: 'failed' },
        ]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Status"
        class="w-32"
      />

      <div class="flex-1" />

      <div class="hidden lg:flex items-center gap-4 text-sm">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-status-scheduled" />
          {{ monthStats.scheduled }} scheduled
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-success" />
          {{ monthStats.published }} published
        </span>
        <span v-if="monthStats.failed > 0" class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-destructive" />
          {{ monthStats.failed }} failed
        </span>
      </div>
    </div>

    <ECard class="overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <EButton variant="ghost" icon="i-lucide-chevron-left" size="sm" @click="previousMonth" />
            <h2 class="text-lg font-semibold text-foreground min-w-[180px] text-center">
              {{ df.format(currentMonth) }}
            </h2>
            <EButton variant="ghost" icon="i-lucide-chevron-right" size="sm" @click="nextMonth" />
          </div>
          <EButton variant="ghost" size="sm" @click="goToToday">Today</EButton>
        </div>
      </template>

      <div class="grid grid-cols-7 border-b border-border">
        <div
          v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
          :key="day"
          class="py-2 text-center text-xs font-medium text-muted-foreground uppercase"
        >
          {{ day }}
        </div>
      </div>

      <div class="grid grid-cols-7">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="min-h-[120px] border-b border-r border-border p-1"
          :class="[
            !day && 'bg-muted/50',
            day && isToday(day) && 'bg-info/10',
          ]"
        >
          <template v-if="day">
            <div class="flex items-center justify-between px-1 mb-1">
              <span
                class="text-sm font-medium"
                :class="isToday(day) ? 'text-info' : 'text-foreground'"
              >
                {{ format(day, 'd') }}
              </span>
              <span v-if="getPostsForDay(day).length > 3" class="text-xs text-muted-foreground">
                +{{ getPostsForDay(day).length - 3 }}
              </span>
            </div>

            <div class="space-y-1">
              <button
                v-for="post in getPostsForDay(day).slice(0, 3)"
                :key="post.id"
                @click="openPost(post)"
                class="w-full text-left px-1.5 py-1 rounded text-xs truncate transition-colors"
                :class="getStatusBadgeClasses(post.status)"
              >
                <span class="flex items-center gap-1">
                  <EIcon
                    v-for="platform in [...new Set(post.platforms.map((p) => p.platform))]"
                    :key="platform"
                    :name="platformIcons(platform)"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span class="truncate">{{ post.caption.slice(0, 25) }}</span>
                </span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </ECard>

    <EModal v-model="showPostModal" class="sm:max-w-xl">
      <template v-if="selectedPost" #header>
        <div class="flex items-center gap-2">
          <EBadge :color="selectedPost.status === 'published' ? 'green' : selectedPost.status === 'failed' ? 'red' : 'blue'" variant="subtle">
            {{ selectedPost.status }}
          </EBadge>
          <span class="text-sm text-muted-foreground">
            {{ format(parseISO(selectedPost.scheduled_at), 'MMM d, yyyy • h:mm a') }}
          </span>
        </div>
      </template>

      <template v-if="selectedPost">
        <div v-if="selectedPost.thumbnail_url || selectedPost.media_urls?.length" class="mb-4">
          <img
            :src="selectedPost.thumbnail_url || selectedPost.media_urls[0]"
            :alt="selectedPost.caption"
            class="w-full h-48 object-cover rounded-lg"
          />
        </div>

        <p class="text-foreground whitespace-pre-wrap mb-4">
          {{ selectedPost.caption }}
        </p>

        <div class="mb-4">
          <p class="text-xs font-medium text-muted-foreground uppercase mb-2">Posting to</p>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="target in selectedPost.platforms"
              :key="target.account_id"
              class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full text-xs"
            >
              <EIcon :name="platformIcons(target.platform)" class="w-3 h-3" />
              {{ target.account_name }}
            </div>
          </div>
        </div>

        <div v-if="selectedPost.publish_results?.length" class="mb-4">
          <p class="text-xs font-medium text-muted-foreground uppercase mb-2">Results</p>
          <div class="space-y-2">
            <div
              v-for="result in selectedPost.publish_results"
              :key="result.account_id"
              class="flex items-center justify-between text-sm"
            >
              <span class="flex items-center gap-2">
                <EIcon :name="platformIcons(result.platform)" class="w-4 h-4" />
                {{ result.account_id }}
              </span>
              <EBadge :color="result.success ? 'green' : 'red'" variant="subtle" size="xs">
                {{ result.success ? 'Published' : 'Failed' }}
              </EBadge>
            </div>
          </div>
        </div>
      </template>

      <template v-if="selectedPost" #footer>
        <div class="flex justify-between">
          <EButton
            v-if="['scheduled', 'draft', 'failed'].includes(selectedPost.status)"
            variant="soft"
            color="red"
            size="sm"
            :loading="isDeleting"
            :disabled="isDeleting"
            @click="deleteSelectedPost"
          >
            Delete
          </EButton>
          <div class="flex gap-2">
            <EButton
              v-if="selectedPost.status === 'scheduled' || selectedPost.status === 'draft'"
              variant="soft"
              size="sm"
              :to="{ path: '/apps/marketing', query: { floor: 'studio', view: 'calendar', z: '3', id: selectedPost.id } }"
            >
              Edit
            </EButton>
            <EButton size="sm" @click="showPostModal = false">Close</EButton>
          </div>
        </div>
      </template>
    </EModal>
  </div>
</template>
