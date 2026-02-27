/**
 * Firebase Admin SDK initialization for server-side operations
 * This replaces the NestJS FirebaseService with a simpler Next.js compatible version
 */

import admin from 'firebase-admin';

let firebaseApp;

/**
 * Initialize Firebase Admin SDK
 * @returns {admin.app.App} Firebase Admin App instance
 */
export function initializeFirebaseAdmin() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      firebaseApp = admin.app();
      return firebaseApp;
    }

    // Get credentials from environment
    let projectId = process.env.FIREBASE_PROJECT_ID;
    let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Support GOOGLE_SERVICE_ACCOUNT_KEY JSON format
    const saKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (saKeyJson) {
      try {
        const sa = JSON.parse(saKeyJson);
        projectId = projectId || sa.project_id;
        clientEmail = clientEmail || sa.client_email;
        privateKey = privateKey || sa.private_key;
      } catch (err) {
        console.warn('Failed parsing GOOGLE_SERVICE_ACCOUNT_KEY:', err.message);
      }
    }

    // Normalize newline escapes in private key
    if (privateKey) {
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        try {
          privateKey = JSON.parse(privateKey);
        } catch (e) {
          privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
        }
      } else {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
    }

    // Initialize with credentials
    if (projectId && clientEmail && privateKey) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
      console.log('📋 Project ID:', projectId);
    } else {
      console.warn('Firebase Admin credentials not complete. Using default credentials.');
      console.warn('Missing:', {
        projectId: !!projectId,
        clientEmail: !!clientEmail,
        privateKey: !!privateKey,
      });
      firebaseApp = admin.initializeApp({
        projectId: projectId || undefined,
      });
    }

    return firebaseApp;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
}

/**
 * Get Firestore instance
 * @returns {admin.firestore.Firestore}
 */
export function getFirestore() {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.firestore();
}

/**
 * Get Firebase Auth instance
 * @returns {admin.auth.Auth}
 */
export function getAuth() {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.auth();
}

/**
 * Get Firebase Storage instance
 * @returns {admin.storage.Storage}
 */
export function getStorage() {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.storage();
}

/**
 * Helper to get server timestamp
 * @returns {admin.firestore.FieldValue}
 */
export function getTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Parse date from various formats (Firestore Timestamp, string, Date)
 * @param {any} value - The value to parse
 * @returns {Date|undefined}
 */
export function parseDate(value) {
  if (!value) return undefined;

  // If it's already a Date
  if (value instanceof Date) return value;

  // If it's a Firestore Timestamp
  if (value && typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (e) {
      return undefined;
    }
  }

  // If it's a string
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }

  // If it's a number (timestamp)
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }

  return undefined;
}

export default {
  initializeFirebaseAdmin,
  getFirestore,
  getAuth,
  getStorage,
  getTimestamp,
  parseDate,
};

