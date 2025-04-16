// server/api/auth/[...].ts
import { NuxtAuthHandler } from '#auth';
// Note the .default being used here - this is crucial
import CredentialsProvider from 'next-auth/providers/credentials';

interface DirectusCredentials {
	email: string;
	password: string;
	csrfToken?: string;
	callbackUrl?: string;
	redirect?: boolean;
	[key: string]: string | boolean | undefined;
}

// Define the auth response type
interface DirectusAuthResponse {
	data: {
		access_token: string;
		expires: number;
		refresh_token: string;
	};
}

// Define the user response type
interface DirectusUserResponse {
	data: {
		id: string;
		email: string;
		first_name: string;
		last_name: string;
		avatar?: string;
		role: string;
		organizations?: Array<{
			organizations_id: {
				id: string;
				name: string;
				logo?: string;
			};
		}>;
	};
}

export default NuxtAuthHandler({
	secret: useRuntimeConfig().authSecret,
	pages: {
		signIn: '/auth/signin',
	},

	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				const directusUser = user as any;
				// Store user info and tokens in the JWT
				token.user = {
					id: user.id,
					email: user.email,
					first_name: user.first_name,
					last_name: user.last_name,
					avatar: user.avatar,
					role: user.role,
					organizations: user.organizations,
				};
				token.directusToken = directusUser.accessToken;
				token.refreshToken = directusUser.refreshToken;
				token.accessTokenExpires = directusUser.accessTokenExpires;
			}
			if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
				return token;
			}
			if (token.refreshToken) {
				try {
					const response = await $fetch<DirectusAuthResponse>(`${useRuntimeConfig().public.directusUrl}/auth/refresh`, {
						method: 'POST',
						body: {
							refresh_token: token.refreshToken,
							mode: 'json',
						},
					});

					if (response.data && response.data.access_token) {
						token.directusToken = response.data.access_token;
						token.refreshToken = response.data.refresh_token;
						token.accessTokenExpires = Date.now() + response.data.expires;
						return token;
					}
				} catch (error) {
					console.error('Error refreshing token:', error);
					// Token could not be refreshed - destroy session
					return {};
				}
			}
			return token;
		},
		async session({ session, token }) {
			// Make user and token info available in the session
			if (token.user) {
				session.user = token.user;
			}
			if (token.directusToken) {
				session.directusToken = token.directusToken;
			}
			if (token.refreshToken) {
				session.refreshToken = token.refreshToken; // Add this line
			}
			return session;
		},
	},
	providers: [
		// Important: Use .default here as shown in the example
		// @ts-expect-error You need to use .default here for it to work during SSR
		CredentialsProvider.default({
			name: 'Directus',
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials: DirectusCredentials | undefined) {
				try {
					if (!credentials?.email || !credentials?.password) {
						throw new Error('Missing credentials');
					}

					const directusUrl = useRuntimeConfig().public.directusUrl;

					// Using $fetch instead of directus SDK for login
					const authResponse = await $fetch<DirectusAuthResponse>(`${directusUrl}/auth/login`, {
						method: 'POST',
						body: {
							email: credentials.email,
							password: credentials.password,
						},
						headers: {
							'Content-Type': 'application/json',
						},
					});

					if (!authResponse || !authResponse.data || !authResponse.data.access_token) {
						throw new Error('Authentication failed');
					}

					// Fetch user data
					const userResponse = await $fetch<DirectusUserResponse>(`${directusUrl}/users/me`, {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${authResponse.data.access_token}`,
						},
						params: {
							fields: [
								'id',
								'first_name',
								'last_name',
								'email',
								'avatar',
								'role',
								'organizations.organizations_id.id',
								'organizations.organizations_id.name',
								'organizations.organizations_id.logo',
								'organizations.organizations_id.icon',
								'organizations.organizations_id.tickets',
								'organizations.organizations_id.projects',
							].join(','),
						},
					});

					if (!userResponse || !userResponse.data) {
						throw new Error('Failed to fetch user data');
					}

					// Structure the user data for NextAuth
					return {
						id: userResponse.data.id,
						email: userResponse.data.email,
						first_name: userResponse.data.first_name,
						last_name: userResponse.data.last_name,
						avatar: userResponse.data.avatar,
						role: userResponse.data.role,
						organizations: userResponse.data.organizations,
						accessToken: authResponse.data.access_token,
						accessTokenExpires: Date.now() + authResponse.data.expires,
						refreshToken: authResponse.data.refresh_token,
					};
				} catch (error) {
					console.error('Authentication error:', error);
					return null;
				}
			},
		}),
	],
	session: {
		strategy: 'jwt',
		maxAge: 7 * 24 * 60 * 60, // 7 days in seconds for active session
	},
	jwt: {
		maxAge: 30 * 24 * 60 * 60, // 30 days for refresh capability
	},
});
