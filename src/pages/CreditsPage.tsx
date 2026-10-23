import { useState } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import assets from '../../clone-data/asset-references.json';
import './credits-page.css';

type Asset = { src: string; alt: string };
const manifest = assets as Asset[];

export default function CreditsPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const catalogQuery = useSeriesCatalog();
  const searchItems = toSiteSearchItems(catalogQuery.items);
  const trendingItems = toTrendingSiteSearchItems(catalogQuery.items);

  return (
    <div className={`vortex-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={manifest[5]?.src ?? ''}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        communityHref="/#community"
        search={<SiteSearch items={searchItems} trendingItems={trendingItems} />}
      />

      <main className="credits-page">
        <article className="credits-card">
          <h1>Credits</h1>
          <p className="credits-card-intro">Clydee wouldn't exist without the people and projects behind every chapter.</p>

          <section className="credits-section">
            <h2>Manga / comic sources</h2>
            <p>The Scanlation Groups behind every chapter.</p>
          </section>

          <section className="credits-section">
            <h2>Comics info</h2>
            <p>MangaDex, MangaUpdates, MyAnimeList, AniList.</p>
          </section>

          <section className="credits-section">
            <h2>Community</h2>
            <p>Admins, moderators, and every member of the community — thanks for the reports and feedback.</p>
          </section>
        </article>
      </main>

      <SiteFooter
        className="footer credits-page-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
