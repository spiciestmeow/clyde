import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
} from '../lib/siteSettings';
import { useIsAdmin } from '../hooks/useIsAdmin';

type SiteFooterProps = {
  logoSrc: string;
  tagline: string;
  className?: string;
  id?: string;
};

export default function SiteFooter({
  logoSrc,
  tagline,
  className = 'footer',
  id,
}: SiteFooterProps) {
  const { isAdmin } = useIsAdmin();
  const [donateSettings, setDonateSettings] = useState<{ donate: boolean; adminOnly: boolean }>(() => {
    const cached = getCachedSiteSettings()?.header;
    return {
      donate: cached?.donate ?? false,
      adminOnly: cached?.donateAdminOnly ?? false,
    };
  });
  const [facebookUrl, setFacebookUrl] = useState(
    () => getCachedSiteSettings()?.facebookUrl || 'https://facebook.com',
  );

  useEffect(() => {
    let active = true;
    void getSiteSettings()
      .then((settings) => {
        if (active) {
          setDonateSettings({
            donate: settings.header?.donate ?? false,
            adminOnly: settings.header?.donateAdminOnly ?? false,
          });
          setFacebookUrl(settings.facebookUrl || 'https://facebook.com');
        }
      })
      .catch(() => {});

    const handleUpdate = () => {
      const cached = getCachedSiteSettings();
      setDonateSettings({
        donate: cached?.header?.donate ?? false,
        adminOnly: cached?.header?.donateAdminOnly ?? false,
      });
      if (cached?.facebookUrl) {
        setFacebookUrl(cached.facebookUrl);
      }
    };

    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const canSeeDonate = donateSettings.donate && (!donateSettings.adminOnly || isAdmin);

  return (
    <footer className={className} id={id}>
      <div className="footer-inner">
        <div className="footer-logo-row">
          <Link className="footer-logo-link" href="/" aria-label="Clydee">
            <img
              src={logoSrc}
              alt="Clydee logo"
              width={360}
              height={360}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              fetchPriority="low"
            />
          </Link>
        </div>
        <div className="footer-tagline"><p>{tagline}</p></div>
        <ul className="footer-links">
          <li><Link href="/credits">Credits</Link></li>
          {canSeeDonate && <li><Link href="/donate">Support Us</Link></li>}
          <li><Link href="/install-pwa">Install PWA</Link></li>
          <li><a href={facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a></li>
        </ul>
        <hr />
        <div className="footer-copyright">
          <div>© 2026 All Rights Reserved<br />v3.2.012</div>
        </div>
      </div>
    </footer>
  );
}
