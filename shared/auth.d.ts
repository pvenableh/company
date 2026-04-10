// types/auth.d.ts
// Augment nuxt-auth-utils module types for this project

declare module '#auth-utils' {
  interface User {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    avatar: string | null
    role: {
      id: string
      name: string
      admin_access?: boolean
    } | null
  }

  interface UserSession {
    loggedInAt: number
    expiresAt?: number
  }

  interface SecureSessionData {
    directusAccessToken?: string
    directusRefreshToken?: string
  }
}

export {}
