/**
 * useReactions - Polymorphic reaction management for the new project timeline system
 */

import type {
  ReactionRecord,
  ReactionWithRelations,
  ReactionCount,
  ReactionSummary,
  ReactionTypeRecord,
  ReactableCollection,
  CreateReactionPayload,
} from '~/types/reactions';

export function useReactions() {
  const reactions = useDirectusItems<ReactionRecord>('reactions');
  const reactionTypes = useDirectusItems<ReactionTypeRecord>('reaction_types');
  const { user } = useDirectusAuth();

  const cachedReactionTypes = useState<ReactionTypeRecord[]>('reaction-types', () => []);

  const getReactionTypes = async (): Promise<ReactionTypeRecord[]> => {
    if (cachedReactionTypes.value.length > 0) return cachedReactionTypes.value;

    const types = await reactionTypes.list({
      filter: { status: { _eq: 'published' } },
      sort: ['sort', 'name'],
      limit: -1,
    });

    cachedReactionTypes.value = types;
    return types;
  };

  const getReactions = async (
    collection: ReactableCollection,
    itemId: string
  ): Promise<ReactionWithRelations[]> => {
    return await reactions.list({
      filter: {
        collection: { _eq: collection },
        item_id: { _eq: itemId },
      },
      fields: [
        '*',
        'user_created.id',
        'user_created.first_name',
        'user_created.last_name',
        'user_created.avatar',
        'reaction_type.*',
      ],
      limit: -1,
    }) as ReactionWithRelations[];
  };

  const getReactionSummary = async (
    collection: ReactableCollection,
    itemId: string
  ): Promise<ReactionSummary> => {
    const allReactions = await getReactions(collection, itemId);
    const currentUserId = user.value?.id;

    const reactionCounts: ReactionCount[] = [];

    for (const reaction of allReactions) {
      let existingCount = reactionCounts.find(
        (r) => r.reaction_type.id === reaction.reaction_type.id
      );

      if (!existingCount) {
        existingCount = {
          reaction_type: reaction.reaction_type,
          count: 0,
          users: [],
          hasReacted: false,
        };
        reactionCounts.push(existingCount);
      }

      existingCount.count++;
      existingCount.users.push(reaction.user_created);
      if (reaction.user_created.id === currentUserId) {
        existingCount.hasReacted = true;
      }
    }

    reactionCounts.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.reaction_type.sort ?? 999) - (b.reaction_type.sort ?? 999);
    });

    return {
      item_id: itemId,
      collection,
      reactions: reactionCounts,
      totalCount: allReactions.length,
    };
  };

  const toggleReaction = async (
    payload: CreateReactionPayload
  ): Promise<{ action: 'added' | 'removed' | 'switched'; reaction: ReactionWithRelations | null }> => {
    if (!user.value?.id) throw new Error('Must be logged in to react');

    const existingReactions = await reactions.list({
      filter: {
        collection: { _eq: payload.collection },
        item_id: { _eq: payload.item_id },
        user_created: { _eq: user.value.id },
      },
      fields: ['*', 'reaction_type.*'],
      limit: -1,
    });

    const existingSameType = existingReactions.find(
      (r) => r.reaction_type === payload.reaction_type ||
             (typeof r.reaction_type === 'object' && r.reaction_type.id === payload.reaction_type)
    );

    if (existingSameType) {
      await reactions.remove(existingSameType.id);
      return { action: 'removed', reaction: null };
    }

    const isSwitching = existingReactions.length > 0;
    if (isSwitching) {
      await reactions.remove(existingReactions.map((r) => r.id));
    }

    const created = await reactions.create(
      {
        collection: payload.collection,
        item_id: payload.item_id,
        reaction_type: payload.reaction_type,
      } as Partial<ReactionRecord>,
      {
        fields: [
          '*',
          'user_created.id',
          'user_created.first_name',
          'user_created.last_name',
          'user_created.avatar',
          'reaction_type.*',
        ],
      }
    ) as ReactionWithRelations;

    return { action: isSwitching ? 'switched' : 'added', reaction: created };
  };

  const removeReaction = async (reactionId: number): Promise<boolean> => {
    return await reactions.remove(reactionId);
  };

  function useReactionSummary(collection: ReactableCollection, itemId: Ref<string> | string) {
    const summary = ref<ReactionSummary>({
      item_id: typeof itemId === 'string' ? itemId : itemId.value,
      collection,
      reactions: [],
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

  function useReactionTypes() {
    const types = ref<ReactionTypeRecord[]>([]);
    const loading = ref(true);

    onMounted(async () => {
      types.value = await getReactionTypes();
      loading.value = false;
    });

    return { types, loading };
  }

  return {
    getReactionTypes,
    getReactions,
    getReactionSummary,
    toggleReaction,
    removeReaction,
    useReactionSummary,
    useReactionTypes,
  };
}
