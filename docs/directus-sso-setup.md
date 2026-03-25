# Directus SSO Configuration

## Overview

Earnest uses Directus as the identity provider. SSO (Google, Apple) is handled entirely
by Directus — our Nuxt app just redirects to Directus and receives tokens back.

## Architecture

### Login Flow (existing users)
```
User clicks "Sign in with Google" on login page
  → Redirect to: DIRECTUS_URL/auth/login/google?redirect=APP_URL/auth/sso-callback
  → Directus handles full OAuth exchange with Google
  → Google authenticates user, returns to Directus
  → Directus matches user by email (ALLOW_PUBLIC_REGISTRATION=false)
  → Directus redirects to: APP_URL/auth/sso-callback#access_token=xxx&refresh_token=xxx
  → Our callback page captures tokens, POSTs to /api/auth/sso-callback
  → Server validates tokens, creates session
```

### Registration Flow (new users — hybrid)
```
User fills in name + email + org name on register page
User clicks "Sign up with Google"
  → POST to /api/auth/google-register with { email, first_name, last_name, organization_name }
  → Server creates directus_users record (no password, provider: 'google')
  → Server creates organization + seeds roles + owner membership
  → Server creates Stripe customer
  → Server returns Google SSO URL
  → Client redirects to DIRECTUS_URL/auth/login/google?redirect=...
  → Directus matches user by email (record already exists from step above)
  → Normal SSO callback flow creates session
```

**Why this order?** With `ALLOW_PUBLIC_REGISTRATION=false`, Directus rejects unknown emails.
By creating the user record first, we ensure Directus can match them when Google returns.
The user gets a proper org, roles, and Stripe customer — same as email/password registration.

### Invited Users
```
Admin invites user via /api/org/invite-member → creates directus_users + org_membership
Invited user clicks "Sign in with Google" → Directus matches by email → works
```

## Directus Server Environment Variables

Add these to your Directus server's `.env` file (at admin.huestudios.company):

### Google Sign-In

```env
# Enable Google as an auth provider
AUTH_PROVIDERS="google"

AUTH_GOOGLE_DRIVER="openid"
AUTH_GOOGLE_CLIENT_ID="<your Google OAuth Client ID>"
AUTH_GOOGLE_CLIENT_SECRET="<your Google OAuth Client Secret>"
AUTH_GOOGLE_ISSUER_URL="https://accounts.google.com/.well-known/openid-configuration"
AUTH_GOOGLE_ALLOW_PUBLIC_REGISTRATION=false
AUTH_GOOGLE_DEFAULT_ROLE_ID="<UUID of default user role in Directus>"
AUTH_GOOGLE_REDIRECT_URL="https://admin.huestudios.company/auth/login/google/callback"
AUTH_GOOGLE_IDENTIFIER_KEY="email"
AUTH_GOOGLE_ICON="google"
AUTH_GOOGLE_LABEL="Google"
```

### Apple Sign-In

Apple requires additional setup in the Apple Developer Portal first.

```env
# Add apple to the providers list (comma-separated)
AUTH_PROVIDERS="google,apple"

AUTH_APPLE_DRIVER="openid"
AUTH_APPLE_CLIENT_ID="<your Apple Service ID — e.g., guru.earnest.auth>"
AUTH_APPLE_CLIENT_SECRET="<generated JWT — see Apple setup below>"
AUTH_APPLE_ISSUER_URL="https://appleid.apple.com/.well-known/openid-configuration"
AUTH_APPLE_ALLOW_PUBLIC_REGISTRATION=true
AUTH_APPLE_DEFAULT_ROLE_ID="<same UUID as Google>"
AUTH_APPLE_REDIRECT_URL="https://admin.huestudios.company/auth/login/apple/callback"
AUTH_APPLE_IDENTIFIER_KEY="email"
AUTH_APPLE_ICON="apple"
AUTH_APPLE_LABEL="Apple"
AUTH_APPLE_SCOPE="name email"
AUTH_APPLE_PARAMS__response_mode="form_post"
```

## Apple Developer Portal Setup

Apple Sign-In requires a paid Apple Developer account ($99/yr).

### 1. Create an App ID
- Go to: https://developer.apple.com/account/resources/identifiers/list/bundleId
- Click "+" → Register an App ID
- Description: "Earnest"
- Bundle ID: `guru.earnest.app` (or your app bundle ID)
- Enable "Sign In with Apple"
- Save

### 2. Create a Service ID
- Go to: https://developer.apple.com/account/resources/identifiers/list/serviceId
- Click "+" → Register a Services ID
- Description: "Earnest Web Auth"
- Identifier: `guru.earnest.auth`
- Enable "Sign In with Apple"
- Configure:
  - Domains: `admin.huestudios.company` (later: `admin.earnest.guru`)
  - Return URLs: `https://admin.huestudios.company/auth/login/apple/callback`
- Save

### 3. Create a Key
- Go to: https://developer.apple.com/account/resources/authkeys/list
- Click "+" → Register a New Key
- Name: "Earnest SSO Key"
- Enable "Sign In with Apple"
- Configure → select your primary App ID
- Register and download the `.p8` key file
- Note the Key ID shown

### 4. Generate the Client Secret JWT

Apple doesn't use a static client secret — it requires a JWT signed with your `.p8` key.
The JWT expires after 6 months max, so you'll need to regenerate periodically.

```bash
# Install the generator
npm install -g apple-signin-auth

# Generate the client secret
npx apple-signin-auth generate-secret \
  --team-id "<your 10-char Team ID>" \
  --key-id "<your Key ID from step 3>" \
  --client-id "guru.earnest.auth" \
  --private-key-path ./AuthKey_XXXXXXXX.p8 \
  --exp-months 6
```

Or use this Node script to generate it:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./AuthKey_XXXXXXXX.p8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: '<your 10-char Team ID>',
  subject: 'guru.earnest.auth',
  keyid: '<your Key ID>',
});

console.log(token);
```

Set the output as `AUTH_APPLE_CLIENT_SECRET` in your Directus `.env`.

## Google Cloud Console Setup

The Google OAuth credentials already exist for calendar integration. To also use them
for Sign-In:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Edit the existing OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://admin.huestudios.company/auth/login/google/callback
   ```
4. Under "Authorized JavaScript origins", add:
   ```
   https://admin.huestudios.company
   https://huestudios.company
   ```
5. Save

## Finding the Default Role ID

The `AUTH_*_DEFAULT_ROLE_ID` should be the UUID of the role assigned to new SSO users.
In Directus:

1. Go to Settings → Roles & Permissions
2. Find the role you want SSO users to get (probably the standard user role)
3. The UUID is in the URL: `/admin/settings/roles/<UUID>`

Or query it:
```
GET /roles?filter[name][_eq]=User&fields=id
```

## Testing

After configuring Directus:

1. Restart the Directus server to pick up new env vars
2. Visit: `https://admin.huestudios.company/auth/login/google?redirect=https://huestudios.company/auth/sso-callback`
3. You should see the Google consent screen
4. After authenticating, you should be redirected back to the app

## Domain Migration Notes

When migrating from `huestudios.company` to `earnest.guru`:

1. Update `AUTH_GOOGLE_REDIRECT_URL` and `AUTH_APPLE_REDIRECT_URL` on Directus
2. Update Google Cloud Console redirect URIs
3. Update Apple Developer Portal return URLs and domains
4. Update the `SITE_URL` env var in Nuxt

The Nuxt-side code uses `config.public.siteUrl` dynamically, so no code changes needed.
