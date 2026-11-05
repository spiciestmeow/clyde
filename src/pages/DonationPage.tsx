import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Heart,
  Sparkles,
  Info,
  ExternalLink,
  Copy,
  Check,
  X,
  Clock,
  CreditCard,
  Users,
  ChevronDown,
  Star,
  ShieldCheck,
} from 'lucide-react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import { useIsAdmin } from '../hooks/useIsAdmin';
import {
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
  DEFAULT_SITE_SETTINGS,
  type SiteSettings,
} from '../lib/siteSettings';
import assets from '../../clone-data/asset-references.json';
import './donation-page.css';

type Asset = { src: string; alt: string };
const manifest = assets as Asset[];

// Method colors & config matching Miyomi
const METHOD_CONFIG: Record<
  string,
  { bg: string; accent: string; text: string; logoUrl: string }
> = {
  paypal: {
    bg: '#003087',
    accent: '#002266',
    text: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b7/PayPal_Logo_Icon_2014.svg',
  },
  kofi: {
    bg: '#FF5E5B',
    accent: '#E04845',
    text: '#ffffff',
    logoUrl: 'https://storage.ko-fi.com/cdn/cup-border.png',
  },
  bitcoin: {
    bg: '#F7931A',
    accent: '#D97F15',
    text: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg',
  },
  usdt: {
    bg: '#26A17B',
    accent: '#1E8264',
    text: '#ffffff',
    logoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
  },
  gcash: {
    bg: '#007DFE',
    accent: '#0065CC',
    text: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg',
  },
  binance: {
    bg: '#F3BA2F',
    accent: '#E0A820',
    text: '#000000',
    logoUrl: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.svg',
  },
  reward: {
    bg: '#5865F2',
    accent: '#4752C4',
    text: '#ffffff',
    logoUrl: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
  },
};

type PaymentMethod = {
  id: string;
  name: string;
  detail: string;
  isUrl: boolean;
  addressOrUrl: string;
  instructions?: string;
  network?: string;
  accountName?: string;
};

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'paypal',
    name: 'PayPal',
    detail: 'Send via PayPal (International)',
    isUrl: true,
    addressOrUrl: 'https://paypal.me/clydee',
    instructions: 'Send money easily from anywhere with PayPal balance, linked bank account, or debit/credit card.',
  },
  {
    id: 'kofi',
    name: 'Ko-fi',
    detail: 'Buy us a coffee',
    isUrl: true,
    addressOrUrl: 'https://ko-fi.com/clydee',
    instructions: 'Support Clydee with 0% platform fees. One-time or monthly coffees help keep servers running.',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin (BTC)',
    detail: 'Send BTC directly',
    isUrl: false,
    addressOrUrl: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    network: 'Bitcoin Native (SegWit / Legacy)',
    instructions: 'Please double-check the recipient address and confirm the Bitcoin network before sending.',
  },
  {
    id: 'usdt',
    name: 'USDT (Tether)',
    detail: 'Send USDT (TRC20 ONLY)',
    isUrl: false,
    addressOrUrl: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd36AmyWK',
    network: 'TRON (TRC20 ONLY)',
    instructions: 'Important: Only send TRC20 USDT to this address. Sending funds via ERC20, BSC, or other networks may result in permanent loss.',
  },
  {
    id: 'gcash',
    name: 'GCash',
    detail: 'Send via GCash (Philippines)',
    isUrl: false,
    addressOrUrl: '0917-XXX-XXXX',
    accountName: 'Clydee Admin',
    instructions: 'Fast mobile wallet transfer in the Philippines via GCash Send Money / Express Send.',
  },
  {
    id: 'binance',
    name: 'Binance',
    detail: 'Send via Binance Pay',
    isUrl: false,
    addressOrUrl: '382910482',
    accountName: 'Clydee Pay',
    instructions: 'Instant transfer with 0 gas fees between Binance accounts using Binance Pay ID.',
  },
  {
    id: 'reward',
    name: 'Claim Your Reward',
    detail: 'Thank you for your support!',
    isUrl: true,
    addressOrUrl: 'https://discord.gg/clydee',
    instructions: 'Join our Discord server and submit your donation screenshot or txhash to claim your Supporter role & badge!',
  },
];

// Top 3 Podium Supporters
const PODIUM_SUPPORTERS = [
  {
    rank: 2,
    name: 'Anonymous #20',
    amount: '$48.56',
    meta: '1 donation · 5mo ago',
    rankColor: '#9AA6B2', // Silver
  },
  {
    rank: 1,
    name: 'Anonymous #25',
    amount: '$48.56',
    meta: '1 donation · 5mo ago',
    rankColor: '#D4A017', // Gold
  },
  {
    rank: 3,
    name: 'grazzhella Vicente',
    amount: '$45.54',
    meta: '1 donation · 5mo ago',
    rankColor: '#B87333', // Bronze
  },
];

// 20 Initial Recent Donors
const INITIAL_SUPPORTERS = [
  { name: 'Abdul Rahmann', amount: '$1.32', count: 1, time: '2mo ago' },
  { name: 'Ali alromaihi', amount: '$0.76', count: 1, time: '3mo ago' },
  { name: 'Anna domi', amount: '$13.15', count: 1, time: '4mo ago' },
  { name: 'Anonymous #1', amount: '$4.06', count: 1, time: '4mo ago' },
  { name: 'Anonymous #10', amount: '$2.11', count: 1, time: '4mo ago' },
  { name: 'Anonymous #11', amount: '$1.62', count: 1, time: '4mo ago' },
  { name: 'Anonymous #12', amount: '$2.43', count: 1, time: '4mo ago' },
  { name: 'Anonymous #13', amount: '$1.85', count: 1, time: '4mo ago' },
  { name: 'Anonymous #14', amount: '$3.24', count: 1, time: '5mo ago' },
  { name: 'Anonymous #15', amount: '$0.81', count: 1, time: '5mo ago' },
  { name: 'Anonymous #16', amount: '$3.24', count: 1, time: '5mo ago' },
  { name: 'Anonymous #17', amount: '$0.88', count: 1, time: '5mo ago' },
  { name: 'Anonymous #18', amount: '$1.62', count: 1, time: '5mo ago' },
  { name: 'Anonymous #19', amount: '$0.59', count: 1, time: '5mo ago' },
  { name: 'Anonymous #2', amount: '$0.81', count: 1, time: '5mo ago' },
  { name: 'Anonymous #21', amount: '$0.08', count: 1, time: '5mo ago' },
  { name: 'Anonymous #22', amount: '$4.35', count: 1, time: '5mo ago' },
  { name: 'Anonymous #23', amount: '$0.16', count: 1, time: '5mo ago' },
  { name: 'Anonymous #24', amount: '$3.24', count: 1, time: '5mo ago' },
  { name: 'Anonymous #26', amount: '$1.62', count: 1, time: '5mo ago' },
];

const MORE_SUPPORTERS = [
  { name: 'Marcus Sterling', amount: '$10.00', count: 1, time: '5mo ago' },
  { name: 'Elena Rostova', amount: '$8.50', count: 2, time: '5mo ago' },
  { name: 'Kaito Tanaka', amount: '$5.00', count: 1, time: '6mo ago' },
  { name: 'Anonymous #28', amount: '$3.00', count: 1, time: '6mo ago' },
  { name: 'ZeroTwo Fan', amount: '$12.00', count: 3, time: '6mo ago' },
  { name: 'Lucas Silva', amount: '$2.50', count: 1, time: '6mo ago' },
  { name: 'Anonymous #31', amount: '$1.50', count: 1, time: '7mo ago' },
  { name: 'MangaCollector99', amount: '$20.00', count: 4, time: '7mo ago' },
  { name: 'Sora Cloud', amount: '$4.20', count: 1, time: '7mo ago' },
  { name: 'Anonymous #35', amount: '$1.00', count: 1, time: '7mo ago' },
];

// DiceBear avatar generator matching Miyomi exactly
function getDiceBearAvatar(name: string): string {
  const seed = encodeURIComponent(name.trim().toLowerCase());
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export default function DonationPage() {
  const [, setLocation] = useLocation();
  const { isAdmin, checkingAuth } = useIsAdmin();
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => getCachedSiteSettings() ?? DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    let active = true;
    void getSiteSettings()
      .then((s) => {
        if (active) setSiteSettings(s);
      })
      .catch(() => {});
    const onUpdate = () => {
      const cached = getCachedSiteSettings();
      if (cached) setSiteSettings(cached);
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, onUpdate);
    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, onUpdate);
    };
  }, []);

  const donateEnabled = siteSettings.header?.donate ?? false;
  const adminOnly = siteSettings.header?.donateAdminOnly ?? false;
  const isBlocked = !checkingAuth && !isAdmin && (adminOnly || !donateEnabled);

  useEffect(() => {
    if (isBlocked) {
      setLocation('/');
    }
  }, [isBlocked, setLocation]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const catalogQuery = useSeriesCatalog();
  const searchItems = toSiteSearchItems(catalogQuery.items);
  const trendingItems = toTrendingSiteSearchItems(catalogQuery.items);

  const [activeModalMethod, setActiveModalMethod] = useState<PaymentMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const [supportersList, setSupportersList] = useState(INITIAL_SUPPORTERS);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  const currentRaised = 405.6;
  const targetGoal = 662;
  const progressPercent = Math.min(100, Math.round((currentRaised / targetGoal) * 100));

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadMore = () => {
    if (!hasLoadedMore) {
      setSupportersList((prev) => [...prev, ...MORE_SUPPORTERS]);
      setHasLoadedMore(true);
    }
  };

  if (checkingAuth || isBlocked) {
    return null;
  }

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

      <div className="donation-page-wrapper">
        <main className="donation-container">
          {adminOnly && isAdmin && (
            <div
              style={{
                background: 'rgba(236, 72, 153, 0.12)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                borderRadius: '12px',
                padding: '12px 18px',
                margin: '0 auto 24px',
                maxWidth: '780px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <ShieldCheck size={20} style={{ color: '#ec4899', flexShrink: 0 }} />
              <span>
                <strong>Admin Preview Mode:</strong> Donation is set to <em>Admin Only</em>. Public visitors cannot see the donate button or access this page.
              </span>
            </div>
          )}
          {/* ── 1. Hero ────────────────────────────────────────── */}
          <section className="donation-hero">
            <div className="donation-hero-pill">
              <Heart size={14} fill="currentColor" />
              <span>Support Clydee</span>
            </div>
            <h1 className="donation-hero-title">
              Keep Clydee <span className="alive-gradient">Alive</span>
            </h1>
            <p className="donation-hero-subtitle">
              Clyde is a free, community-driven library for apps, extensions, repositories, guides, and tutorials.
              <br className="hidden md:block" />
              Your support helps keep the project independent and accessible to everyone.
            </p>
          </section>

          {/* ── 2. Fund Goal Card ──────────────────────────────── */}
          <section className="miyomi-card">
            <div className="card-header-flex">
              <div className="card-title-group">
                <div className="card-icon-box">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="card-heading">
                    Keep Clydee Online — Infrastructure Fund
                  </h2>
                  <p className="card-subtext">
                    The ${targetGoal} goal is our current fundraising target.
                  </p>
                </div>
              </div>
            </div>

            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="progress-shine"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="progress-meta-row">
              <span className="progress-raised-text">
                <strong>${currentRaised.toFixed(1)}</strong> raised of ${targetGoal}
              </span>
              <span className="progress-badge">{progressPercent}%</span>
            </div>
          </section>

          {/* ── 3. Transparency Card ───────────────────────────── */}
          <section className="miyomi-card">
            <div className="card-header-flex">
              <div className="card-title-group">
                <div className="card-icon-box">
                  <Info size={20} />
                </div>
                <h2 className="card-heading">Transparency</h2>
              </div>
            </div>
            <p className="card-header-desc">
              Clear, simple, and open. Here's how Clydee is funded and maintained.
            </p>

            <div className="transparency-5col-grid">
              {/* Box 1: Annual Cost (1 col) */}
              <div className="transparency-subcard trans-col-1">
                <div className="subcard-tag">
                  <Clock size={14} />
                  <span>Annual Cost</span>
                </div>
                <div className="annual-cost-val">
                  ~${targetGoal} <span>/ year</span>
                </div>
                <p className="annual-cost-desc">Estimated total to run Clydee</p>
                <p className="annual-cost-note">All costs are in USD.</p>
              </div>

              {/* Box 2: Cost Breakdown (2 cols) */}
              <div className="transparency-subcard trans-col-2">
                <div className="subcard-tag">
                  <CreditCard size={14} />
                  <span>Cost Breakdown</span>
                </div>
                <div className="breakdown-row-list">
                  <div className="breakdown-row">
                    <span className="breakdown-label">Hosting & Backend - Infrastructure</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value">$60 (minimum)</span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">clydee.org - Domain Renewal</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value">Paid for Two years</span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">Maintainer Tools & Connectivity</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value">~$502</span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">Cloudflare - CDN & Hosting</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value is-free">Free</span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">Community Content & Production</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value">~$100</span>
                  </div>
                  <div className="breakdown-total-row">
                    <span className="breakdown-label" style={{ fontWeight: 600 }}>Total (USD / year)</span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value">~${targetGoal}</span>
                  </div>
                </div>
              </div>

              {/* Box 3: Where Funds Go (2 cols) */}
              <div className="transparency-subcard trans-col-2">
                <div className="subcard-tag">
                  <Heart size={14} style={{ color: '#ec4899' }} />
                  <span>Where Funds Go</span>
                </div>
                <div className="breakdown-row-list">
                  <div className="breakdown-row">
                    <span className="breakdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="funds-bullet-dot" />
                      <span>Keeping Clydee Online</span>
                    </span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Hosting and infrastructure
                    </span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="funds-bullet-dot" />
                      <span>Development & Maintenance</span>
                    </span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Tools, Servers, and testing
                    </span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="funds-bullet-dot" />
                      <span>Community Content</span>
                    </span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Graphics, articles, and guides
                    </span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="funds-bullet-dot" />
                      <span>Clyde Fund Reserve</span>
                    </span>
                    <span className="breakdown-dots" />
                    <span className="breakdown-value" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Unexpected upgrades & backups
                    </span>
                  </div>
                </div>
                <div className="funds-footer-note">
                  <strong>No salaries. No profit.</strong>
                  <br />
                  100% goes toward keeping Clydee online.
                </div>
              </div>
            </div>

            <div className="transparency-callout-box">
              <ShieldCheck />
              <p className="transparency-callout-text">
                <strong>Why transparency matters:</strong> Your contributions help cover real costs so
                Clyde can remain free, open, and independent. We believe in open community — and open books.
              </p>
            </div>
          </section>

          {/* ── 4. Support Methods ─────────────────────────────── */}
          <section className="miyomi-card">
            <div className="card-header-flex">
              <div className="card-title-group">
                <div className="card-icon-box pink-icon">
                  <Heart size={20} />
                </div>
                <h2 className="card-heading">Support method</h2>
              </div>
            </div>
            <p className="card-header-desc">
              Optional support. No paywalls, no premium access — ever.
            </p>

            <div className="methods-grid">
              {PAYMENT_METHODS.map((method) => {
                const cfg = METHOD_CONFIG[method.id] || METHOD_CONFIG.paypal;
                return (
                  <button
                    key={method.id}
                    type="button"
                    className="method-card-btn"
                    style={{ borderColor: `${cfg.bg}22` }}
                    onClick={() => {
                      if (method.isUrl) {
                        window.open(method.addressOrUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        setActiveModalMethod(method);
                      }
                    }}
                  >
                    <div
                      className="method-icon-container"
                      style={{ background: `${cfg.bg}14` }}
                    >
                      <img src={cfg.logoUrl} alt={method.name} />
                    </div>
                    <div className="method-info-copy">
                      <span className="method-label-title">{method.name}</span>
                      <span className="method-label-desc">{method.detail}</span>
                    </div>
                    {method.isUrl && (
                      <ExternalLink
                        size={14}
                        style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 5. Supporters Section ──────────────────────────── */}
          <section className="miyomi-card">
            <div className="card-header-flex">
              <div className="card-title-group">
                <div className="card-icon-box">
                  <Users size={20} />
                </div>
                <h2 className="card-heading">Supporters</h2>
              </div>
              <span className="progress-badge">116 supporters</span>
            </div>
            <p className="card-header-desc">
              Top 3 by lifetime support, followed by the latest donations.
            </p>

            {/* Top 3 Podium */}
            <div className="supporters-podium-grid">
              {PODIUM_SUPPORTERS.map((p) => {
                const slotClass =
                  p.rank === 2
                    ? 'podium-slot-1'
                    : p.rank === 1
                    ? 'podium-slot-2'
                    : 'podium-slot-3';
                return (
                  <div
                    key={p.rank}
                    className={`podium-card ${slotClass}`}
                    style={{ borderTopColor: p.rankColor, borderTopWidth: 2 }}
                  >
                    <div className="podium-star-badge">
                      <Star size={18} fill={p.rankColor} color={p.rankColor} />
                    </div>
                    <img
                      src={getDiceBearAvatar(p.name)}
                      alt={p.name}
                      className="podium-avatar-img"
                    />
                    <div className="podium-name" title={p.name}>
                      {p.name}
                    </div>
                    <div className="podium-amount">{p.amount}</div>
                    <div className="podium-meta">{p.meta}</div>
                  </div>
                );
              })}
            </div>

            {/* Recent 5-Col Donors Grid */}
            <div className="supporters-5col-grid">
              {supportersList.map((supporter, idx) => (
                <div key={`${supporter.name}-${idx}`} className="donor-item-card">
                  <div className="donor-top-row">
                    <img
                      src={getDiceBearAvatar(supporter.name)}
                      alt={supporter.name}
                      className="donor-avatar-img"
                    />
                    <div className="donor-title-wrap">
                      <div className="donor-name-text" title={supporter.name}>
                        {supporter.name}
                      </div>
                      <div className="donor-count-text">
                        {supporter.count} donation{supporter.count > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="donor-bottom-row">
                    <span className="donor-time-text">{supporter.time}</span>
                    <span className="donor-amount-val">{supporter.amount}</span>
                  </div>
                </div>
              ))}
            </div>

            {!hasLoadedMore && (
              <button
                type="button"
                className="load-more-btn"
                onClick={handleLoadMore}
              >
                <ChevronDown size={16} />
                <span>Load more supporters</span>
              </button>
            )}
          </section>

          {/* ── 6. From The Team ───────────────────────────────── */}
          <section className="miyomi-card">
            <div className="team-card-flex">
              <div className="team-avatar-box">
                <img
                  src="/clydee-logo.png"
                  alt="Clydee Mascot"
                />
              </div>
              <div>
                <h3 className="team-heading">From The Team</h3>
                <p className="team-para">
                  Clyde started as a small project and grew thanks to an amazing community.
                  <br className="hidden md:block" />
                  Your support—big or small—helps keep Clydee alive.
                </p>
                <div className="team-thank-you">
                  <Heart />
                  <span>Thank you!</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ── Payment Details Modal ───────────────────────────── */}
      {activeModalMethod && (() => {
        const cfg = METHOD_CONFIG[activeModalMethod.id] || METHOD_CONFIG.paypal;
        return (
          <div
            className="miyomi-modal-overlay"
            onClick={() => setActiveModalMethod(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="miyomi-modal-box"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-header-banner"
                style={{ background: `linear-gradient(135deg, ${cfg.bg}, ${cfg.accent})` }}
              >
                <div className="modal-header-icon">
                  <img src={cfg.logoUrl} alt={activeModalMethod.name} />
                </div>
                <div>
                  <h3 className="modal-header-title">{activeModalMethod.name}</h3>
                  <p className="modal-header-desc">{activeModalMethod.detail}</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setActiveModalMethod(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body-content">
                {activeModalMethod.instructions && (
                  <p className="modal-instruction-text">
                    {activeModalMethod.instructions}
                  </p>
                )}

                {activeModalMethod.accountName && (
                  <div className="modal-copy-field">
                    <div className="modal-field-info">
                      <div className="modal-field-label">Account Name</div>
                      <div className="modal-field-val">{activeModalMethod.accountName}</div>
                    </div>
                  </div>
                )}

                {activeModalMethod.network && (
                  <div className="modal-copy-field">
                    <div className="modal-field-info">
                      <div className="modal-field-label">Network</div>
                      <div className="modal-field-val">{activeModalMethod.network}</div>
                    </div>
                  </div>
                )}

                <div className="modal-copy-field">
                  <div className="modal-field-info">
                    <div className="modal-field-label">
                      {activeModalMethod.id === 'gcash' ? 'Mobile Number' : 'Address / Account ID'}
                    </div>
                    <div className="modal-field-val">{activeModalMethod.addressOrUrl}</div>
                  </div>
                  <button
                    type="button"
                    className={`modal-copy-trigger${copied ? ' is-copied' : ''}`}
                    onClick={() => handleCopy(activeModalMethod.addressOrUrl)}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                {activeModalMethod.isUrl && (
                  <a
                    href={activeModalMethod.addressOrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-ext-link-btn"
                    style={{ background: cfg.bg }}
                  >
                    <ExternalLink size={15} />
                    <span>Open {activeModalMethod.name}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <SiteFooter
        className="footer credits-page-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
