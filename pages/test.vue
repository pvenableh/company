<template>
	<div>
		<UButton @click="migrateCommentItemToUuid">Migrate Comment Item To UUID</UButton>
		<UButton @click="migrateCommentItemToUuid2">Migrate Comment Item To UUID 2</UButton>
	</div>
</template>

<script setup>
const { readItems, updateItem } = useDirectusItems();

async function migrateCommentItemToUuid() {
	try {
		// Fetch all comments
		const comments = await readItems('comments', {
			fields: ['id', 'item_id'],
		});

		for (const comment of comments) {
			if (comment.item_id) {
				try {
					// Attempt to parse the item string as a UUID
					const uuid = comment.item_id; // No parsing needed if 'item' already contains UUID strings.

					// Update the comment with the UUID in the new item_id field
					await updateItem('comments', comment.id, {
						item: uuid,
					});

					console.log(`Comment ${comment.id} migrated successfully.`);
				} catch (error) {
					console.error(`Error migrating comment ${comment.id}:`, error);
					// Handle invalid UUIDs or other errors
				}
			}
		}

		console.log('Migration complete.');
	} catch (error) {
		console.error('Error fetching comments:', error);
	}
}

async function migrateCommentItemToUuid2() {
	try {
		const comments = await readItems('comments', {
			fields: ['id', 'tickets_id'],
		});

		for (const comment of comments) {
			console.log(comment.tickets_id);
			if (comment.tickets_id && typeof comment.tickets_id === 'string') {
				try {
					// Assuming comment.item is already a valid UUID string.
					await updateItem('comments', comment.id, {
						item: comment.tickets_id,
					});

					console.log(`Comment ${comment.id} migrated successfully.`);
				} catch (error) {
					console.error(`Error migrating comment ${comment.id}:`, error);
				}
			}
		}

		console.log('Migration complete.');
	} catch (error) {
		console.error('Error fetching comments:', error);
	}
}
</script>
