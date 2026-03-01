/**
 * useTimelineLayout - Timeline positioning and layout calculations
 */

import type { ProjectWithRelations, TimelineLane } from '~/types/projects';

export function useTimelineLayout(
  projects: Ref<ProjectWithRelations[]>,
  zoom: Ref<number>
) {
  const laneHeight = 220;
  const headerHeight = 60;
  const padding = 100;

  const dateRange = computed(() => {
    let min = Infinity;
    let max = -Infinity;

    for (const project of projects.value) {
      const startTime = new Date(project.start_date || new Date().toISOString()).getTime();
      if (!isNaN(startTime) && startTime < min) min = startTime;

      if (project.completion_date) {
        const endTime = new Date(project.completion_date).getTime();
        if (!isNaN(endTime) && endTime > max) max = endTime;
      }

      for (const event of project.events || []) {
        const eventTime = new Date(event.event_date || event.date || '').getTime();
        if (!isNaN(eventTime)) {
          if (eventTime < min) min = eventTime;
          if (eventTime > max) max = eventTime;
        }
      }
    }

    if (min === Infinity || max === -Infinity) {
      const now = Date.now();
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      min = now - oneMonth;
      max = now + oneMonth;
    }

    const today = Date.now();
    if (today > max) max = today;

    const range = max - min;
    const rangePadding = range * 0.1;

    return {
      start: new Date(min - rangePadding),
      end: new Date(max + rangePadding),
    };
  });

  const canvasWidth = computed(() => 1200 * zoom.value);

  const getXPosition = (dateString: string): number => {
    const time = new Date(dateString || new Date().toISOString()).getTime();
    if (isNaN(time)) return padding;
    const range = dateRange.value.end.getTime() - dateRange.value.start.getTime();
    if (range === 0) return padding;
    const ratio = (time - dateRange.value.start.getTime()) / range;
    return padding + ratio * (canvasWidth.value - 2 * padding);
  };

  const getDateFromX = (x: number): Date => {
    const ratio = (x - padding) / (canvasWidth.value - 2 * padding);
    const range = dateRange.value.end.getTime() - dateRange.value.start.getTime();
    return new Date(dateRange.value.start.getTime() + ratio * range);
  };

  const todayX = computed(() => getXPosition(new Date().toISOString()));

  const getLaneIndex = (project: ProjectWithRelations, allProjects: ProjectWithRelations[]): number => {
    const rootProjects = allProjects.filter((p) => !p.parent_id);
    const rootIndex = rootProjects.findIndex((p) => p.id === project.id);
    if (rootIndex !== -1) return rootIndex;

    const parentId = typeof project.parent_id === 'object' ? project.parent_id?.id : project.parent_id;
    const parent = allProjects.find((p) => p.id === parentId);

    if (parent) {
      const parentLane = getLaneIndex(parent, allProjects);
      const siblings = allProjects.filter((p) => {
        const pParentId = typeof p.parent_id === 'object' ? p.parent_id?.id : p.parent_id;
        return pParentId === parent.id;
      });
      const siblingIndex = siblings.findIndex((p) => p.id === project.id);
      return parentLane + siblingIndex + 1;
    }

    return 0;
  };

  const lanes = computed<TimelineLane[]>(() => {
    return projects.value.map((project) => ({
      project,
      laneIndex: getLaneIndex(project, projects.value),
      yPosition: getLaneIndex(project, projects.value) * laneHeight + headerHeight,
    }));
  });

  const totalLanes = computed(() => {
    if (lanes.value.length === 0) return 1;
    return Math.max(...lanes.value.map((l) => l.laneIndex)) + 1;
  });

  const canvasHeight = computed(() => totalLanes.value * laneHeight + headerHeight + 60);

  const timeLabels = computed(() => {
    const labels: { x: number; text: string }[] = [];
    const current = new Date(dateRange.value.start);
    current.setDate(1);

    while (current <= dateRange.value.end) {
      labels.push({
        x: getXPosition(current.toISOString()),
        text: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
      });
      current.setMonth(current.getMonth() + 1);
    }

    return labels;
  });

  const gridSpacing = computed(() => 100 * zoom.value);

  return {
    lanes,
    dateRange,
    totalLanes,
    laneHeight,
    headerHeight,
    padding,
    canvasWidth,
    canvasHeight,
    gridSpacing,
    todayX,
    timeLabels,
    getXPosition,
    getDateFromX,
    getLaneIndex,
  };
}
