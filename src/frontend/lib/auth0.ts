// File: kinetix-studio/frontend/lib/auth0.ts
// This file configures an optional Auth0 client for server-side session access.

import { Auth0Client } from "@auth0/nextjs-auth0/server";

const hasConfig = Boolean(
  process.env.AUTH0_SECRET &&
    process.env.APP_BASE_URL &&
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET
);

export const authEnabled = hasConfig;

export const auth0 = hasConfig
  ? new Auth0Client({
      authorizationParameters: {
        scope: process.env.AUTH0_SCOPE,
        audience: process.env.AUTH0_AUDIENCE
      }
    })
  : null;