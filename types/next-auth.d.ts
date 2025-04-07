// types/next-auth.d.ts
import NextAuth from "next-auth";

declare module "next-auth" {
  /**
   * Extends the built-in session with custom properties
   */
  interface Session {
    user: {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
      avatar?: string;
      role?: string;
      organizations?: any[];
    };
    directusToken?: string;
  }

  /**
   * Extends the built-in user with custom properties
   */
  interface User {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar?: string;
    role?: string;
    organizations?: any[];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

declare module "next-auth/jwt" {
  /** Extend JWT with custom fields */
  interface JWT {
    user?: {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
      avatar?: string;
      role?: string;
      organizations?: any[];
    };
    directusToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}