import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, Bookmark, Home, Smartphone } from 'lucide-react';
import './mobile-bottom-nav.css';

function getStoredUnreadCount(): number {
  try {
    const raw = localStorage.getItem('vortex-unread-count');
    if (!raw) return 0;
    const count = parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export default function MobileBottomNav() {
  const [location] = useLocation();
  const [unreadCount, setUnreadCount] = useState<number>(getStoredUnreadCount);

  // Sync unread notification count across app events and storage
  useEffect(() => {
    const handleUnreadUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      if (typeof customEvent.detail === 'number') {
        setUnreadCount(customEvent.detail);
      } else {
        setUnreadCount(getStoredUnreadCount());
      }
    };

    const handleReadStateChange = () => {
      setUnreadCount(getStoredUnreadCount());
    };

    window.addEventListener('vortex-unread-count-updated', handleUnreadUpdate);
    window.addEventListener('vortex-notification-read-change', handleReadStateChange);
    window.addEventListener('storage', handleReadStateChange);

    return () => {
      window.removeEventListener('vortex-unread-count-updated', handleUnreadUpdate);
      window.removeEventListener('vortex-notification-read-change', handleReadStateChange);
      window.removeEventListener('storage', handleReadStateChange);
    };
  }, []);

  // Hide on admin panel routes
  if (location.startsWith('/panel/')) {
    return null;
  }

  const isHomeActive = location === '/';
  const isSeriesActive = location === '/series' || location.startsWith('/series/');
  const isBookmarksActive = location === '/bookmarks';
  const isNotificationsActive = location === '/notifications';
  const isPwaActive = location === '/install-pwa' || location === '/install';

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav__inner">
        {/* 1. Series */}
        <Link
          href="/series"
          className={`mobile-bottom-nav__item${isSeriesActive ? ' is-active' : ''}`}
          aria-label="Series"
        >
          <div className="mobile-bottom-nav__item-pill">
            <div className="mobile-bottom-nav__icon-wrapper">
              <Home
                size={20}
                fill={isSeriesActive ? 'currentColor' : 'none'}
                strokeWidth={isSeriesActive ? 2.2 : 1.8}
              />
            </div>
            <span className="mobile-bottom-nav__label">Series</span>
          </div>
        </Link>

        {/* 2. Bookmarks */}
        <Link
          href="/bookmarks"
          className={`mobile-bottom-nav__item${isBookmarksActive ? ' is-active' : ''}`}
          aria-label="Bookmarks"
        >
          <div className="mobile-bottom-nav__item-pill">
            <div className="mobile-bottom-nav__icon-wrapper">
              <Bookmark
                size={20}
                fill={isBookmarksActive ? 'currentColor' : 'none'}
                strokeWidth={isBookmarksActive ? 2.2 : 1.8}
              />
            </div>
            <span className="mobile-bottom-nav__label">Bookmarks</span>
          </div>
        </Link>

        {/* 3. Center Elevated Button - Homepage (Web Logo) */}
        <Link
          href="/"
          className="mobile-bottom-nav__home-btn"
          aria-label="Homepage"
          title="Home"
        >
          <div className="mobile-bottom-nav__home-circle">
            <img
              src="/clydee-logo.png"
              alt="Clydee"
              className="mobile-bottom-nav__home-logo"
              width={34}
              height={34}
            />
          </div>
        </Link>

        {/* 4. Notifications */}
        <Link
          href="/notifications"
          className={`mobile-bottom-nav__item${isNotificationsActive ? ' is-active' : ''}`}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <div className="mobile-bottom-nav__item-pill">
            <div className="mobile-bottom-nav__icon-wrapper">
              <Bell
                size={20}
                fill={isNotificationsActive ? 'currentColor' : 'none'}
                strokeWidth={isNotificationsActive ? 2.2 : 1.8}
              />
              {unreadCount > 0 && (
                <span className="mobile-bottom-nav__badge" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="mobile-bottom-nav__label">Notifications</span>
          </div>
        </Link>

        {/* 5. PWA */}
        <Link
          href="/install-pwa"
          className={`mobile-bottom-nav__item${isPwaActive ? ' is-active' : ''}`}
          aria-label="Install PWA"
        >
          <div className="mobile-bottom-nav__item-pill">
            <div className="mobile-bottom-nav__icon-wrapper">
              <Smartphone size={20} strokeWidth={isPwaActive ? 2.4 : 1.8} />
            </div>
            <span className="mobile-bottom-nav__label">PWA</span>
          </div>
        </Link>
      </div>
    </nav>
  );
}
