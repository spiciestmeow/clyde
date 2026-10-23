import { useState } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import assets from '../../clone-data/asset-references.json';
import vortexLogo from '../assets/vortex-logo.webp';
import './dmca-policy.css';

type Asset = { src: string; alt: string };
const manifest = assets as Asset[];

export default function DmcaPolicyPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const catalogQuery = useSeriesCatalog();
  const searchItems = toSiteSearchItems(catalogQuery.items);
  const trendingItems = toTrendingSiteSearchItems(catalogQuery.items);

  return (
    <div className={`vortex-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc={vortexLogo}
        discordSrc={manifest[5]?.src ?? ''}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        communityHref="/#community"
        search={<SiteSearch items={searchItems} trendingItems={trendingItems} />}
      />

      <main className="dmca-page">
        <article className="dmca-card">
          <h1>DMCA Policy</h1>
          <section className="dmca-section">
            <h2>Copyright Takedown Requests</h2>
            <p>
              If you believe that material available through Vortex Scans infringes a copyright you own
              or are authorized to represent, you may submit a written DMCA notice. Please identify the
              material clearly so it can be located and reviewed.
            </p>
            <h3>DMCA Notice Requirements</h3>
            <ol>
              <li>Include a physical or electronic signature of the copyright owner or an authorized representative.</li>
              <li>Identify the copyrighted work you believe has been infringed. If multiple works are involved, provide a representative list.</li>
              <li>Identify the material you believe is infringing and provide its URL or other information that lets us find it.</li>
              <li>Provide contact information, such as your name, mailing address, telephone number, and email address.</li>
              <li>State that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law.</li>
              <li>State that the information in your notice is accurate and, under penalty of perjury, that you are authorized to act for the owner of the allegedly infringed right.</li>
            </ol>
            <p>
              Send notices to the service provider’s designated agent. The U.S. Copyright Office maintains a{' '}
              <a href="https://dmca.copyright.gov/osp/" target="_blank" rel="noreferrer">
                public directory of designated agents
              </a>
              .
            </p>
          </section>

          <section className="dmca-section">
            <h2>Counter-Notification</h2>
            <p>
              If material you posted was removed or disabled and you believe this happened because of a
              mistake or misidentification, you may submit a written counter-notification. It should include:
            </p>
            <ol>
              <li>Your physical or electronic signature.</li>
              <li>Identification of the material that was removed and where it appeared before removal.</li>
              <li>A statement, under penalty of perjury, that you have a good-faith belief the material was removed because of a mistake or misidentification.</li>
              <li>Your name, address, and telephone number, plus the required consent to jurisdiction and acceptance of service of process.</li>
            </ol>
          </section>

          <section className="dmca-section">
            <h2>Important</h2>
            <p>
              Notices and counter-notifications are formal legal requests. Make sure the information you
              provide is complete and accurate. Knowingly making material misrepresentations may have legal
              consequences.
            </p>
            <p className="dmca-updated">Last updated: October 23, 2026</p>
          </section>
        </article>
      </main>

      <SiteFooter
        logoSrc={manifest[0]?.src ?? vortexLogo}
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Vortex, your ultimate library."
      />
    </div>
  );
}
