import { Link } from 'wouter';

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
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/credits">Credits</a></li>
          <li><a href="https://discord.gg/2PuMt62fRN">Discord</a></li>
        </ul>
        <hr />
        <div className="footer-copyright">
          <div>© 2026 All Rights Reserved<br />v3.2.012</div>
        </div>
      </div>
    </footer>
  );
}
