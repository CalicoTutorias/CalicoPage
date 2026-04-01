/**
 * GET /api/users/tutors — Get approved tutors, optionally filtered by courseId
 * Query params: courseId (optional), limit (optional, default 100)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as userService from '@/lib/services/user.service';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId');
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 100;

  let result;
  if (courseId) {
    result = await userService.getTutorsByCourse(courseId, limit);
  } else {
    result = await userService.getAllTutors(limit);
  }

  return NextResponse.json(result);
}
