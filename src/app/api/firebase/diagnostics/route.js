/**
 * Firebase Diagnostics API Route
 * GET /api/firebase/diagnostics - Check Firebase Admin SDK configuration
 */

import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

/**
 * GET /api/firebase/diagnostics
 */
export async function GET(request) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    const config = {
      hasProjectId: !!projectId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey,
      hasServiceAccountKey: !!serviceAccountKey,
      projectId: projectId || '(not set)',
      clientEmail: clientEmail ? `${clientEmail.substring(0, 30)}...` : '(not set)',
    };

    let initStatus = 'Not initialized';
    let initError = null;

    try {
      initializeFirebaseAdmin();
      initStatus = 'Successfully initialized';
    } catch (error) {
      initError = error.message;
      initStatus = 'Failed to initialize';
    }

    return NextResponse.json({
      success: true,
      firebaseConfig: config,
      initializationStatus: initStatus,
      initializationError: initError,
      recommendations: [
        !config.hasProjectId && 'Set FIREBASE_PROJECT_ID in .env.local',
        !config.hasClientEmail && 'Set FIREBASE_CLIENT_EMAIL in .env.local',
        !config.hasPrivateKey && 'Set FIREBASE_PRIVATE_KEY in .env.local',
        !config.hasServiceAccountKey && 'Or set GOOGLE_SERVICE_ACCOUNT_KEY (full JSON) in .env.local',
      ].filter(Boolean),
    });
  } catch (error) {
    console.error('Diagnostics error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

