/**
 * Career (Major) by ID
 * GET /api/majors/[id] - Get a single career by ID
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as academicService from '../../../../lib/services/academic.service';

/**
 * GET /api/majors/[id]
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const career = await academicService.getCareerById(id);
    if (!career) {
      return NextResponse.json({ success: false, error: 'Career not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, major: career });
  } catch (error) {
    console.error('Error getting career:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
