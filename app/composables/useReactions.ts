/**
 * useReactions - Polymorphic reaction management
 *
 * Uses existing `reactions` Directus collection with fields: table, item, reaction (string), user.
 * Supports any string-based reaction: legacy types (love, like, idea, dislike) and emoji identifiers.
 *
 * Note: The Directus column is named `table` but we use `collection` at the app level for
 * consistency with the comments system. Mapping happens at the API boundary.
 */

import type {
  ReactionRecord,
  ReactionWithUser,
  ReactionGroup,
  ReactionSummary,
  CreateReactionPayload,
} from '~~/shared/reactions';

export function useReactions() {
  const reactions = useDirectusItems<ReactionRecord>('reactions');
  const { user } = useDirectusAuth();

  const getReactions = async (
    collection: string,
    itemId: string
  ): Promise<ReactionWithUser[]> => {
    return await reactions.list({
      filter: {
        item: { _eq: itemId },
        table: { _eq: collection },
      },
      fields: [
        '*',
        'user.id',
        'user.first_name',
        'user.last_name',
        'user.avatar',
      ],
      limit: -1,
    }) as ReactionWithUser[];
  };

  const getReactionSummary = async (
    collection: string,
    itemId: string
  ): Promise<ReactionSummary> => {
    const allReactions = await getReactions(collection, itemId);
    const currentUserId = user.value?.id;

    const groups: ReactionGroup[] = [];

    for (const r of allReactions) {
      if (!r.reaction) continue;

      let group = groups.find((g) => g.reaction === r.reaction);
      if (!group) {
        group = {
          reaction: r.reaction,
          count: 0,
          users: [],
          hasReacted: false,
          activeReactionId: null,
        };
        groups.push(group);
      }

      group.count++;
      group.users.push(r.user);
      if (r.user.id === currentUserId) {
        group.hasReacted = true;
        group.activeReactionId = r.id;
      }
    }

    groups.sort((a, b) => b.count - a.count);

    return {
      item: itemId,
      collection,
      groups,
      totalCount: allReactions.length,
    };
  };

  const toggleReaction = async (
    payload: CreateReactionPayload
  ): Promise<{ action: 'added' | 'removed' | 'switched' }> => {
    if (!user.value?.id) throw new Error('Must be logged in to react');

    const existing = await reactions.list({
      filter: {
        item: { _eq: payload.item },
        user: { _eq: user.value.id },
        reaction: { _eq: payload.reaction },
      },
    });

    if (existing.length > 0) {
      await reactions.remove(existing[0].id);
      return { action: 'removed' };
    }

    const otherReactions = await reactions.list({
      filter: {
        item: { _eq: payload.item },
        user: { _eq: user.value.id },
      },
    });

    const isSwitching = otherReactions.length > 0;
    if (isSwitching) {
      for (const r of otherReactions) {
        await reactions.remove(r.id);
      }
    }

    await reactions.create({
      status: 'published',
      item: payload.item,
      table: payload.collection,
      user: user.value.id,
      reaction: payload.reaction,
    } as Partial<ReactionRecord>);

    return { action: isSwitching ? 'switched' : 'added' };
  };

  const removeReaction = async (reactionId: string): Promise<boolean> => {
    return await reactions.remove(reactionId);
  };

  function useReactionSummary(collection: string, itemId: Ref<string> | string) {
    const summary = ref<ReactionSummary>({
      item: typeof itemId === 'string' ? itemId : itemId.value,
      collection,
      groups: [],
      totalCount: 0,
    });
    const loading = ref(true);

    const fetch = async () => {
      const id = typeof itemId === 'string' ? itemId : itemId.value;
      summary.value = await getReactionSummary(collection, id);
      loading.value = false;
    };

    onMounted(() => fetch());
    if (typeof itemId !== 'string') watch(itemId, () => fetch());

    return { summary, loading, refresh: fetch };
  }

  return {
    getReactions,
    getReactionSummary,
    toggleReaction,
    removeReaction,
    useReactionSummary,
  };
}
