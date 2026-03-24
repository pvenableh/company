# Task 5 — Daily.co Video Integration

## Context
The `video_meetings` Directus collection currently uses Twilio Video (field: `room_sid`).
Daily.co is cheaper (~4x) and has a simpler API. The collection shape stays the same —
`room_name` becomes the Daily room name, `room_sid` stores the Daily room ID.

The existing Twilio video components and API routes need to be replaced with Daily.co equivalents.

## Step 1 — Read existing implementation first

Before writing any code:
1. Read all files in `server/api/` that contain 'video' or 'meeting' in the path
2. Read `components/Scheduler/` files related to video meetings
3. Read the `VideoMeeting` type in `types/directus.ts` — do not change this type
4. Note the exact field names used: `room_name`, `room_sid`, `meeting_url`, `status`

## Step 2 — Create server/utils/daily.ts

```typescript
// Daily.co API client
// Docs: https://docs.daily.co/reference/rest-api

const DAILY_BASE_URL = 'https://api.daily.co/v1'

function getDailyApiKey(): string {
  const config = useRuntimeConfig()
  const key = config.dailyApiKey || process.env.DAILY_API_KEY
  if (!key) throw new Error('DAILY_API_KEY is not configured')
  return key
}

async function dailyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DAILY_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getDailyApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Daily.co API error ${res.status}: ${error}`)
  }
  return res.json() as Promise<T>
}

export interface DailyRoom {
  id: string
  name: string
  url: string
  created_at: string
  config: Record<string, any>
}

export interface DailyMeetingToken {
  token: string
}

/**
 * Create a Daily.co room for a meeting.
 * Rooms auto-delete after expiry.
 */
export async function createDailyRoom(params: {
  name: string
  expiresAt?: Date      // defaults to 24h from now
  maxParticipants?: number
  enableRecording?: boolean
}): Promise<DailyRoom> {
  const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000)

  return dailyFetch<DailyRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      properties: {
        exp: Math.floor(expiresAt.getTime() / 1000),
        max_participants: params.maxParticipants ?? 25,
        enable_recording: params.enableRecording ? 'cloud' : 'none',
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  })
}

/**
 * Generate a meeting token for a participant.
 * Tokens control permissions (owner vs guest).
 */
export async function createDailyMeetingToken(params: {
  roomName: string
  userId?: string
  userName?: string
  isOwner?: boolean
  expiresAt?: Date
}): Promise<string> {
  const expiresAt = params.expiresAt ?? new Date(Date.now() + 4 * 60 * 60 * 1000)

  const result = await dailyFetch<DailyMeetingToken>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: params.roomName,
        user_id: params.userId,
        user_name: params.userName,
        is_owner: params.isOwner ?? false,
        exp: Math.floor(expiresAt.getTime() / 1000),
        eject_at_token_exp: true,
      },
    }),
  })
  return result.token
}

/**
 * Delete a Daily.co room explicitly (cleanup after meeting ends).
 */
export async function deleteDailyRoom(roomName: string): Promise<void> {
  await dailyFetch(`/rooms/${roomName}`, { method: 'DELETE' })
}

/**
 * Get room info (check if it exists, participant count, etc.)
 */
export async function getDailyRoom(roomName: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch<DailyRoom>(`/rooms/${roomName}`)
  } catch {
    return null
  }
}
```

## Step 3 — Update video meeting API routes

Find the existing routes that create/join/end Twilio video meetings. Read them fully.

For each route, replace the Twilio Video SDK calls with the Daily.co utility functions above.
The route signatures (URL, request body, response shape) should stay the same so the frontend
doesn't need to change.

Key mapping:
- Creating a room: `createDailyRoom({ name: roomName, expiresAt: scheduledEnd })` 
  → store the returned `room.id` in `video_meetings.room_sid`, and `room.url` in `meeting_url`
- Generating a token for a participant: `createDailyMeetingToken({ roomName, userId, isOwner })`
  → return this token to the frontend to embed in the Daily iframe
- Ending a meeting: `deleteDailyRoom(roomName)`, update `video_meetings.status = 'completed'`

## Step 4 — Update the frontend video component

Find the component that renders the Twilio Video UI (likely in `components/Scheduler/`).
Replace it with the Daily.co prebuilt UI:

```vue
<template>
  <div class="w-full h-full">
    <iframe
      v-if="meetingUrl"
      :src="`${meetingUrl}?t=${participantToken}`"
      allow="camera; microphone; fullscreen; display-capture; autoplay"
      class="w-full h-full border-0 rounded-lg"
    />
  </div>
</template>
```

Daily's prebuilt UI handles camera/mic permissions, participant grid, screen sharing, and chat
automatically. No Daily.co JS SDK needs to be installed — the iframe is sufficient.

The `meetingUrl` comes from `video_meetings.meeting_url`.
The `participantToken` comes from calling the join-meeting API route.

## Step 5 — Add environment variable

Add to `.env.example`:
```
# Daily.co video conferencing
DAILY_API_KEY=
```

Add to `nuxt.config.ts` runtimeConfig (server-only):
```typescript
dailyApiKey: process.env.DAILY_API_KEY || '',
```

## Do NOT change
- The `video_meetings` Directus collection schema
- The `VideoMeeting` TypeScript type
- The appointment/scheduler booking flow
- Email/SMS invite sending logic

## After making changes
Run `pnpm typecheck`. Test by creating a video meeting and verifying the room URL opens
in an iframe correctly with camera/mic permissions working.
