'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/SecureAuthContext';
import routes from '../../../routes';
import AdminShell from './_components/AdminShell';

/**
 * Client guard for the entire /home/admin/** subtree.
 *
 * - While auth is resolving, render a minimal placeholder (no flash).
 * - If not logged in → /auth/login.
 * - If logged in but not admin → /home (silent redirect, no banner).
 * - Otherwise wrap children in AdminShell.
 *
 * This is layer 2 of the defense (per ADMIN_DASHBOARD_PLAN.md). The real
 * barrier is requireAdminUser server-side; this guard just spares a
 * non-admin from seeing a broken page while their fetches return 403.
 */
export default function AdminLayout({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user.isLoggedIn) {
      router.replace(routes.LOGIN);
      return;
    }
    if (!user.isAdmin) {
      router.replace(routes.HOME);
    }
  }, [loading, user.isLoggedIn, user.isAdmin, router]);

  if (loading || !user.isLoggedIn || !user.isAdmin) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f7f6f1]">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
