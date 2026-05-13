<template>
  <div class="w-full py-6 min-h-[50vh] space-y-10">
    <!-- Client-facing thread (same rows the portal user sees on this project) -->
    <section v-if="project?.id">
      <header class="mb-3">
        <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Client Conversation</h3>
        <p class="text-[11px] text-muted-foreground/70 mt-0.5">
          Visible to the client in their portal. Replies posted here appear in their view.
        </p>
      </header>
      <ReactionsBar collection="projects" :item-id="project.id" class="mb-3" />
      <CommentsSystem
        :item-id="project.id"
        collection="projects"
        :client-id="typeof project.client === 'object' ? project.client?.id : project.client"
      />
    </section>

    <!-- Internal Slack channels -->
    <section>
      <header class="mb-3">
        <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Internal Channels</h3>
      </header>
      <SlackChannels :project="project" />
    </section>
  </div>
</template>
<script setup>
const props = defineProps({
  project: {
    type: Object,
    default: () => null,
  },
});
</script>
