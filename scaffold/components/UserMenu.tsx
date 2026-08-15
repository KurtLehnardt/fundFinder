'use client';

/**
 * UserMenu.tsx — avatar, name, and log out. Drop into your header.
 *
 *   <header className="flex items-center justify-between ...">
 *     <Logo />
 *     <UserMenu />
 *   </header>
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading || !user) return null;

  const handleSignOut = () => {
    signOut();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-[44px] items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- external avatar; referrerPolicy avoids Google's 403 on lh3.googleusercontent.com */}
      <img
        src={user.avatarUrl}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        className="rounded-full"
      />
      <span className="hidden text-sm font-medium text-[#212121] sm:inline">
        {user.name}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-[#005ea2] transition-colors duration-150 hover:bg-[#ecf1f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005ea2] focus-visible:ring-offset-2"
      >
        Log out
      </button>
    </div>
  );
}
