/**
 * User By ID API Route
 * GET /api/users/[id] - Get user by ID
 * PUT /api/users/[id] - Update user
 */

import { NextResponse } from 'next/server';
import * as userService from '../../../../lib/services/user.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/users/[id]
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const user = await userService.getUserById(id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error in GET /api/users/[id]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error fetching user',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id]
 */
export async function PUT(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    await userService.saveUser(id, body);

    return NextResponse.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      userId: id,
    });
  } catch (error) {
    console.error('Error in PUT /api/users/[id]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error updating user',
      },
      { status: 500 }
    );
  }
}

