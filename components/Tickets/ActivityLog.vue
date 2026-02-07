<template>
  <div class="tickets-activity">
    <div class="relative">
      <!-- Empty state -->
      <div v-if="!activities.length && !isLoading" class="text-center py-10">
        <UIcon name="i-heroicons-clock" class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h3 class="text-lg font-medium text-gray-700 dark:text-gray-300">No activity yet</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Activity will be recorded when changes are made to this ticket
        </p>
      </div>
      
      <!-- Loading state -->
      <div v-if="isLoading" class="text-center py-10">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto text-gray-400 animate-spin" />
        <p class="text-sm text-gray-500 mt-2">Loading activity history...</p>
      </div>
      
      <!-- Activity timeline -->
      <div v-if="activities.length && !isLoading" class="relative">
        <!-- Time line -->
        <div class="absolute left-8 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>
        
        <!-- Activity items -->
        <div class="space-y-8">
          <div v-for="(activity, index) in activities" :key="index" class="relative pl-12">
            <!-- Activity icon -->
            <div class="absolute left-4 bg-white dark:bg-gray-800 rounded-full p-1 border-2 border-gray-200 dark:border-gray-700">
              <UIcon :name="getActivityIcon(activity)" class="w-6 h-6" :class="getActivityIconColor(activity)" />
            </div>
            
            <!-- Activity content -->
            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div class="flex justify-between items-start">
                <div>
                  <span class="font-medium">{{ activity.user }}</span>
                  <span class="text-gray-500 dark:text-gray-400"> {{ activity.action }} </span>
                  <span v-if="activity.field">
                    <span class="font-medium">{{ activity.field }}</span>
                  </span>
                </div>
                <div class="text-xs text-gray-500">{{ formatTimeAgo(activity.timestamp) }}</div>
              </div>
              
              <!-- Change details for edited fields -->
              <div v-if="activity.type === 'update' && activity.oldValue && activity.newValue" class="mt-2 text-sm">
                <div class="flex gap-2 text-gray-500 dark:text-gray-400">
                  <div class="line-through">{{ activity.oldValue }}</div>
                  <UIcon name="i-heroicons-arrow-right" class="w-4 h-4" />
                  <div class="font-medium text-gray-700 dark:text-gray-300">{{ activity.newValue }}</div>
                </div>
              </div>
              
              <!-- Comment content -->
              <div v-if="activity.type === 'comment' && activity.content" class="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded border-l-2 border-gray-300 dark:border-gray-600 text-sm">
                <div v-html="activity.content"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  ticketId: {
    type: String,
    required: true
  }
});

const activities = ref([]);
const isLoading = ref(true);
const commentItems = useDirectusItems('comments');

// Load ticket activity
const loadActivity = async () => {
  isLoading.value = true;
  try {
    // In a real implementation, this would fetch from a dedicated activity log
    // For this example, we'll fetch comments and ticket revision history
    
    // Fetch comments
    const comments = await commentItems.list({
      fields: [
        'id',
        'comment',
        'date_created',
        'user.id',
        'user.first_name',
        'user.last_name'
      ],
      filter: {
        collection: { _eq: 'tickets' },
        item: { _eq: props.ticketId }
      },
      sort: ['-date_created']
    });
    
    // Mock data to demonstrate different activity types
    // In a real implementation, fetch from revisions or a dedicated activity table
    const mockActivities = [
      {
        type: 'create',
        action: 'created this ticket',
        user: 'Sarah Johnson',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      },
      {
        type: 'update',
        action: 'changed',
        field: 'status',
        oldValue: 'Pending',
        newValue: 'In Progress',
        user: 'Mike Thompson',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        type: 'assignment',
        action: 'assigned the ticket to',
        field: 'Alex Williams',
        user: 'Sarah Johnson',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
      },
      {
        type: 'update',
        action: 'changed',
        field: 'priority',
        oldValue: 'medium',
        newValue: 'high',
        user: 'Alex Williams',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        type: 'task',
        action: 'completed task',
        field: 'Update database schema',
        user: 'Alex Williams',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      }
    ];
    
    // Convert comments to activity format
    const commentActivities = comments.map(comment => ({
      type: 'comment',
      action: 'commented',
      content: comment.comment,
      user: `${comment.user.first_name} ${comment.user.last_name}`,
      timestamp: new Date(comment.date_created)
    }));
    
    // Combine and sort activities
    const allActivities = [...mockActivities, ...commentActivities];
    allActivities.sort((a, b) => b.timestamp - a.timestamp);
    
    activities.value = allActivities;
  } catch (error) {
    console.error('Error loading activity:', error);
  } finally {
    isLoading.value = false;
  }
};

// Format relative time
const formatTimeAgo = (date) => {
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerWeek = msPerDay * 7;
  
  const elapsed = new Date() - new Date(date);
  
  if (elapsed < msPerMinute) {
    return 'just now';
  } else if (elapsed < msPerHour) {
    const minutes = Math.round(elapsed / msPerMinute);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (elapsed < msPerDay) {
    const hours = Math.round(elapsed / msPerHour);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (elapsed < msPerWeek) {
    const days = Math.round(elapsed / msPerDay);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: new Date().getFullYear() !== new Date(date).getFullYear() ? 'numeric' : undefined
    });
  }
};

// Get icon for activity type
const getActivityIcon = (activity) => {
  switch (activity.type) {
    case 'create': return 'i-heroicons-plus-circle';
    case 'update': return 'i-heroicons-pencil-square';
    case 'comment': return 'i-heroicons-chat-bubble-left-right';
    case 'assignment': return 'i-heroicons-user-plus';
    case 'task': return 'i-heroicons-check-circle';
    default: return 'i-heroicons-clock';
  }
};

// Get icon color for activity type
const getActivityIconColor = (activity) => {
  switch (activity.type) {
    case 'create': return 'text-green-500';
    case 'update': return 'text-blue-500';
    case 'comment': return 'text-cyan-500';
    case 'assignment': return 'text-purple-500';
    case 'task': return 'text-green-500';
    default: return 'text-gray-500';
  }
};

onMounted(() => {
  loadActivity();
});
</script>