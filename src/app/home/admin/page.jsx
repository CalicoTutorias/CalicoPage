'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /home/admin → redirect to /home/admin/dashboard (default landing).
 */
export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home/admin/dashboard');
  }, [router]);
  return null;
}
