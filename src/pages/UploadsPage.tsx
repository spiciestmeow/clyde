import { useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import SeriesCatalogManager from '../components/SeriesCatalogManager';
import { useThemeMode } from '../hooks/useThemeMode';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import vortexLogo from '../assets/vortex-logo.webp';
import assets from '../../clone-data/asset-references.json';

const assetList = assets as { src: string; alt: string }[];

export default function UploadsPage() {
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenu, setMobileMenu] = useState(false);
  const catalogQuery = useSeriesCatalog();
  const seriesItems = catalogQuery.items;

  const searchItems = toSiteSearchItems(seriesItems);
  const trendingSearchItems = toTrendingSiteSearchItems(seriesItems);

  return (
    <div className={`vortex-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="series"
        logoSrc={vortexLogo}
        discordSrc={assetList[5]?.src || ''}
        mobileMenuOpen={mobileMenu}
        onToggleMobileMenu={() => setMobileMenu(!mobileMenu)}
        dark={dark}
        onToggleTheme={toggleTheme}
        search={
          <SiteSearch
            items={searchItems}
            trendingItems={trendingSearchItems}
          />
        }
      />
      <main style={{ minHeight: '80vh', padding: '20px 0' }}>
        <SeriesCatalogManager />
      </main>
      <SiteFooter
        logoSrc={assetList[0]?.src || ''}
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Vortex, your ultimate library."
      />
    </div>
  );
}
