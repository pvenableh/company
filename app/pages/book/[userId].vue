<!-- pages/book/[userId].vue -->
<!--
  Legacy /book/<userId> redirect. The booking URL shape moved to
  /book/<orgSlug>/<userSlug> for SaaS namespace isolation. This file
  exists only so the route table stays valid during dev HMR — at runtime
  it sends users to a 404, since legacy links were never published.
-->
<script setup>
definePageMeta({ layout: 'blank', auth: false });
throw createError({ statusCode: 404, statusMessage: 'Booking URL has moved. Use /book/<org>/<user>.', fatal: true });
</script>

<template>
	<div />
</template>
