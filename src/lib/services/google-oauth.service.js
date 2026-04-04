/**
 * Google OAuth Service
 * Verifies Google ID tokens from client-side Google Sign-In
 */

import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google ID token and extract user info
 * @param {string} idToken - Google ID token from client
 * @returns {Promise<Object>} User info { googleId, email, name, picture }
 * @throws {Error} If token is invalid
 */
export async function verifyGoogleToken(idToken) {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      throw new Error('Google email not verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    throw new Error(`Invalid Google token: ${error.message}`);
  }
}
