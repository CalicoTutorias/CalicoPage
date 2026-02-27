/**
 * Book Slot API Route
 * POST /api/tutoring-sessions/book-slot - Book a specific availability slot
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions/book-slot
 * Body: { slot, studentEmail, studentName, notes?, selectedCourse? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    if (!body.slot) {
      return NextResponse.json(
        {
          success: false,
          error: 'slot is required',
        },
        { status: 400 }
      );
    }
    
    if (!body.studentEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'studentEmail is required',
        },
        { status: 400 }
      );
    }
    
    if (!body.studentName) {
      return NextResponse.json(
        {
          success: false,
          error: 'studentName is required',
        },
        { status: 400 }
      );
    }
    
    const session = await tutoringSessionService.bookSpecificSlot(
      body.slot,
      body.studentEmail,
      body.studentName,
      body.notes || '',
      body.selectedCourse || null
    );
    
    return NextResponse.json({
      success: true,
      message: 'Slot booked successfully',
      session,
    });
  } catch (error) {
    console.error('Error booking slot:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error booking slot',
      },
      { status: 500 }
    );
  }
}

