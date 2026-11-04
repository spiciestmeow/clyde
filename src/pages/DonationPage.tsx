import { useState } from 'react';
import {
  Heart,
  Settings,
  Info,
  ExternalLink,
  Copy,
  Check,
  X,
  Sparkles,
  Coffee,
  Coins,
  QrCode,
  ShieldCheck,
  Users,
  ChevronDown,
} from 'lucide-react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import assets from '../../clone-data/asset-references.json';
import './donation-page.css';

type Asset = { src: string; alt: string };
const manifest = assets as Asset[];

// Payment method definition
type PaymentMethod = {
  id: string;
  name: string;
  detail: string;
  typeClass: string;
  icon: string;
  addressOrUrl: string;
  isUrl: boolean;
  notes?: string;
};

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'paypal',
    name: 'PayPal',
    detail: 'Send via PayPal (International)',
    typeClass: 'paypal',
    icon: '🅿️',
    addressOrUrl: 'https://paypal.me/clydee',
    isUrl: true,
    notes: 'Fast, secure international donations. You can send via card or PayPal balance.',
  },
  {
    id: 'kofi',
    name: 'Ko-fi',
    detail: 'Buy us a coffee',
    typeClass: 'kofi',
    icon: '☕',
    addressOrUrl: 'https://ko-fi.com/clydee',
    isUrl: true,
    notes: 'Support with 0% platform fee. One-time or recurring coffees welcome!',
  },
  {
    id: 'btc',
    name: 'Bitcoin (BTC)',
    detail: 'Send BTC directly',
    typeClass: 'btc',
    icon: '₿',
    addressOrUrl: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    isUrl: false,
    notes: 'Network: Bitcoin (BTC Native SegWit / Legacy). Please double-check address.',
  },
  {
    id: 'usdt',
    name: 'USDT (Tether)',
    detail: 'Send USDT (TRC20 ONLY)',
    typeClass: 'usdt',
    icon: '₮',
    addressOrUrl: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd36AmyWK',
    isUrl: false,
    notes: 'Network: TRON (TRC20 ONLY). Sending via other networks will cause loss of funds.',
  },
  {
    id: 'gcash',
    name: 'GCash',
    detail: 'Send via GCash (Philippines)',
    typeClass: 'gcash',
    icon: '📱',
    addressOrUrl: '0917-XXX-XXXX (Clydee)',
    isUrl: false,
    notes: 'Fast peer-to-peer transfer via GCash QR or Express Send.',
  },
  {
    id: 'binance',
    name: 'Binance',
    detail: 'Send via Binance Pay',
    typeClass: 'binance',
    icon: '🪙',
    addressOrUrl: 'Pay ID: 382910482',
    isUrl: false,
    notes: 'Zero gas fee transfer between Binance accounts via Binance Pay ID.',
  },
  {
    id: 'reward',
    name: 'Claim Your Reward',
    detail: 'Thank you for your support!',
    typeClass: 'reward',
    icon: '🎁',
    addressOrUrl: 'https://discord.gg/clydee',
    isUrl: true,
    notes: 'Send your donation receipt or transaction hash in Discord to receive your Supporter role & badge!',
  },
];

// Top 3 lifetime supporters
const PODIUM_SUPPORTERS = [
  {
    rank: 2,
    starIcon: '🥈',
    avatar: '💜',
    name: 'Anonymous #20',
    amount: '$48.56',
    meta: '1 donation · 5mo ago',
    rankClass: 'rank-2',
  },
  {
    rank: 1,
    starIcon: '⭐',
    avatar: '👑',
    name: 'Anonymous #25',
    amount: '$48.56',
    meta: '1 donation · 5mo ago',
    rankClass: 'rank-1',
  },
  {
    rank: 3,
    starIcon: '🥉',
    avatar: '🌸',
    name: 'grazzhella Vicente',
    amount: '$45.54',
    meta: '1 donation · 5mo ago',
    rankClass: 'rank-3',
  },
];

// Recent supporters initial batch
const INITIAL_SUPPORTERS = [
  { name: 'Abdul Rahmann', avatar: '🩵', amount: '$1.32', meta: '1 donation · 2mo ago' },
  { name: 'Ali alromaihi', avatar: '⚡', amount: '$0.76', meta: '1 donation · 3mo ago' },
  { name: 'Anna domi', avatar: '🎀', amount: '$13.15', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #1', avatar: '🦊', amount: '$4.06', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #10', avatar: '🐱', amount: '$2.11', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #11', avatar: '👾', amount: '$1.62', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #12', avatar: '🐼', amount: '$2.43', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #13', avatar: '🐸', amount: '$1.85', meta: '1 donation · 4mo ago' },
  { name: 'Anonymous #14', avatar: '🐻', amount: '$3.24', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #15', avatar: '🐯', amount: '$0.81', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #16', avatar: '🦁', amount: '$3.24', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #17', avatar: '🐮', amount: '$0.88', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #18', avatar: '🐨', amount: '$1.62', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #19', avatar: '🐵', amount: '$0.59', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #2', avatar: '🐶', amount: '$0.81', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #21', avatar: '🐧', amount: '$0.08', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #22', avatar: '🐰', amount: '$4.35', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #23', avatar: '🐣', amount: '$0.16', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #24', avatar: '🦉', amount: '$3.24', meta: '1 donation · 5mo ago' },
  { name: 'Anonymous #26', avatar: '🐙', amount: '$1.62', meta: '1 donation · 5mo ago' },
];

const MORE_SUPPORTERS = [
  { name: 'Marcus Sterling', avatar: '⚔️', amount: '$10.00', meta: '1 donation · 5mo ago' },
  { name: 'Elena Rostova', avatar: '✨', amount: '$8.50', meta: '2 donations · 5mo ago' },
  { name: 'Kaito Tanaka', avatar: '🌸', amount: '$5.00', meta: '1 donation · 6mo ago' },
  { name: 'Anonymous #28', avatar: '🐺', amount: '$3.00', meta: '1 donation · 6mo ago' },
  { name: 'ZeroTwo Fan', avatar: '🦄', amount: '$12.00', meta: '3 donations · 6mo ago' },
  { name: 'Lucas Silva', avatar: '☕', amount: '$2.50', meta: '1 donation · 6mo ago' },
  { name: 'Anonymous #31', avatar: '🛡️', amount: '$1.50', meta: '1 donation · 7mo ago' },
  { name: 'MangaCollector99', avatar: '📚', amount: '$20.00', meta: '4 donations · 7mo ago' },
  { name: 'Sora Cloud', avatar: '☁️', amount: '$4.20', meta: '1 donation · 7mo ago' },
  { name: 'Anonymous #35', avatar: '🎭', amount: '$1.00', meta: '1 donation · 7mo ago' },
];

export default function DonationPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const catalogQuery = useSeriesCatalog();
  const searchItems = toSiteSearchItems(catalogQuery.items);
  const trendingItems = toTrendingSiteSearchItems(catalogQuery.items);

  const [activeModalMethod, setActiveModalMethod] = useState<PaymentMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const [supportersList, setSupportersList] = useState(INITIAL_SUPPORTERS);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  // Goal data
  const currentRaised = 405.6;
  const targetGoal = 662;
  const progressPercent = Math.min(100, Math.round((currentRaised / targetGoal) * 100));

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleLoadMore = () => {
    if (!hasLoadedMore) {
      setSupportersList((prev) => [...prev, ...MORE_SUPPORTERS]);
      setHasLoadedMore(true);
    }
  };

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

      <main className="donation-page">
        {/* ── 1. Hero ────────────────────────────────────────── */}
        <section className="donation-hero">
          <div className="donation-hero-badge">
            <Heart size={13} fill="currentColor" />
            <span>Support Clydee</span>
          </div>
          <h1 className="donation-hero-title">
            Keep Clydee <span className="alive-text">Alive</span>
          </h1>
          <p className="donation-hero-subtitle">
            Clyde is a free, community-driven library for manga, manhwa, and manhua.
            Your support helps keep the project independent and accessible to everyone.
          </p>
        </section>

        {/* ── 2. Fund Goal Card ──────────────────────────────── */}
        <section className="donation-card">
          <div className="donation-card-header">
            <div className="donation-card-header-row">
              <div className="donation-card-title-group">
                <span className="donation-card-icon">
                  <Settings size={18} />
                </span>
                <h2 className="donation-card-title">
                  Keep Clydee Online — Infrastructure Fund
                </h2>
              </div>
            </div>
            <p className="donation-card-subtitle">
              The ${targetGoal} goal is our current fundraising target.
            </p>
          </div>

          <div className="donation-progress-bar-bg" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="donation-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="donation-progress-footer">
            <span className="donation-progress-raised">
              ${currentRaised.toFixed(1)} raised of ${targetGoal}
            </span>
            <span className="donation-progress-pct">{progressPercent}%</span>
          </div>
        </section>

        {/* ── 3. Transparency Card ───────────────────────────── */}
        <section className="donation-card">
          <div className="donation-card-header">
            <div className="donation-card-header-row">
              <div className="donation-card-title-group">
                <span className="donation-card-icon" style={{ color: '#38bdf8' }}>
                  <Info size={18} />
                </span>
                <h2 className="donation-card-title">Transparency</h2>
              </div>
            </div>
            <p className="donation-card-subtitle">
              Clear, simple, and open. Here's how Clydee is funded and maintained.
            </p>
          </div>

          <div className="transparency-grid">
            {/* Box 1: Annual Cost */}
            <div className="transparency-box annual-cost-box">
              <span className="transparency-box-tag">Annual Cost</span>
              <div className="annual-cost-amount">
                ~${targetGoal} <span>/ year</span>
              </div>
              <span className="annual-cost-desc">Estimated total to run Clydee</span>
              <span className="annual-cost-sub">(All amounts are in USD)</span>
            </div>

            {/* Box 2: Cost Breakdown */}
            <div className="transparency-box">
              <span className="transparency-box-tag">Cost Breakdown</span>
              <div className="cost-breakdown-list">
                <div className="cost-breakdown-row">
                  <span className="cost-breakdown-label">Hosting & Backend — Infrastructure</span>
                  <span className="cost-breakdown-dots" />
                  <span className="cost-breakdown-value">$60 (minimum)</span>
                </div>
                <div className="cost-breakdown-row">
                  <span className="cost-breakdown-label">Domain Renewal</span>
                  <span className="cost-breakdown-dots" />
                  <span className="cost-breakdown-value">Paid for Two years</span>
                </div>
                <div className="cost-breakdown-row">
                  <span className="cost-breakdown-label">Maintainer Tools & Connectivity</span>
                  <span className="cost-breakdown-dots" />
                  <span className="cost-breakdown-value">~$502</span>
                </div>
                <div className="cost-breakdown-row">
                  <span className="cost-breakdown-label">Cloudflare — CDN & Hosting</span>
                  <span className="cost-breakdown-dots" />
                  <span className="cost-breakdown-value is-free">Free</span>
                </div>
                <div className="cost-breakdown-row">
                  <span className="cost-breakdown-label">Community Content & Production</span>
                  <span className="cost-breakdown-dots" />
                  <span className="cost-breakdown-value">~$100</span>
                </div>
                <div className="cost-breakdown-divider" />
                <div className="cost-breakdown-row is-total">
                  <span>Total (USD / year)</span>
                  <span>~${targetGoal}</span>
                </div>
              </div>
            </div>

            {/* Box 3: Where Funds Go */}
            <div className="transparency-box">
              <span className="transparency-box-tag">Where Funds Go</span>
              <div className="funds-go-list">
                <div className="funds-go-item">
                  <span className="funds-go-title">Keeping Clydee Online</span>
                  <span className="funds-go-desc">Hosting and infrastructure</span>
                </div>
                <div className="funds-go-item">
                  <span className="funds-go-title">Development & Maintenance</span>
                  <span className="funds-go-desc">Tools, Servers, and testing</span>
                </div>
                <div className="funds-go-item">
                  <span className="funds-go-title">Community Content</span>
                  <span className="funds-go-desc">Graphics, articles, and guides</span>
                </div>
                <div className="funds-go-item">
                  <span className="funds-go-title">Clyde Fund Reserve</span>
                  <span className="funds-go-desc">Unexpected upgrades & backups</span>
                </div>
              </div>
              <div className="funds-go-note">
                <strong>No salaries. No profit.</strong>
                <span>100% goes toward keeping Clydee online.</span>
              </div>
            </div>
          </div>

          <div className="transparency-callout">
            <ShieldCheck className="transparency-callout-icon" />
            <span>
              <strong>Why transparency matters:</strong> Your contributions help cover real costs so
              Clyde can remain free, open, and independent. We believe in open community — and open books.
            </span>
          </div>
        </section>

        {/* ── 4. Support Methods ─────────────────────────────── */}
        <section className="donation-card">
          <div className="donation-card-header">
            <div className="donation-card-header-row">
              <div className="donation-card-title-group">
                <span className="donation-card-icon" style={{ color: '#ec4899' }}>
                  <Heart size={18} />
                </span>
                <h2 className="donation-card-title">Support method</h2>
              </div>
            </div>
            <p className="donation-card-subtitle">
              Optional support. No paywalls, no premium access — ever.
            </p>
          </div>

          <div className="support-methods-grid">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                className="support-method-btn"
                onClick={() => {
                  if (method.isUrl) {
                    window.open(method.addressOrUrl, '_blank', 'noopener,noreferrer');
                  } else {
                    setActiveModalMethod(method);
                  }
                }}
              >
                <span className={`support-method-icon-wrap ${method.typeClass}`}>
                  {method.icon}
                </span>
                <div className="support-method-copy">
                  <div className="support-method-name">{method.name}</div>
                  <div className="support-method-detail">{method.detail}</div>
                </div>
                {method.isUrl && (
                  <ExternalLink size={13} style={{ color: 'var(--dn-muted)', flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── 5. Supporters Section ──────────────────────────── */}
        <section className="donation-card">
          <div className="donation-card-header">
            <div className="donation-card-header-row">
              <div className="donation-card-title-group">
                <span className="donation-card-icon">
                  <Users size={18} />
                </span>
                <h2 className="donation-card-title">Supporters</h2>
              </div>
              <span className="donation-badge-pill">116 supporters</span>
            </div>
            <p className="donation-card-subtitle">
              Top 3 by lifetime support, followed by the latest donations.
            </p>
          </div>

          {/* Podium for Top 3 */}
          <div className="supporters-podium">
            {PODIUM_SUPPORTERS.map((p) => (
              <div key={p.rank} className={`supporter-podium-card ${p.rankClass}`}>
                <div className="podium-rank-star">{p.starIcon}</div>
                <div className="podium-avatar">{p.avatar}</div>
                <div className="podium-name">{p.name}</div>
                <div className="podium-amount">{p.amount}</div>
                <div className="podium-meta">{p.meta}</div>
              </div>
            ))}
          </div>

          {/* Recent Donors Grid */}
          <div className="supporters-recent-grid">
            {supportersList.map((supporter, idx) => (
              <div key={`${supporter.name}-${idx}`} className="supporter-item-card">
                <div className="supporter-item-left">
                  <span className="supporter-item-avatar">{supporter.avatar}</span>
                  <div className="supporter-item-info">
                    <span className="supporter-item-name">{supporter.name}</span>
                    <span className="supporter-item-meta">{supporter.meta}</span>
                  </div>
                </div>
                <span className="supporter-item-amount">{supporter.amount}</span>
              </div>
            ))}
          </div>

          {!hasLoadedMore && (
            <button
              type="button"
              className="supporters-load-more-btn"
              onClick={handleLoadMore}
            >
              <ChevronDown size={15} />
              <span>Load more supporters</span>
            </button>
          )}
        </section>

        {/* ── 6. From The Team ───────────────────────────────── */}
        <section className="donation-card donation-team-card">
          <img
            src="/clydee-logo.png"
            alt="Clydee mascot"
            className="donation-team-avatar"
            width={48}
            height={48}
          />
          <div className="donation-team-copy">
            <h3>From The Team</h3>
            <p>
              Clyde started as a small project and grew thanks to an amazing community.
              Your support—big or small—helps keep Clydee alive.
            </p>
            <div className="donation-team-thanks">
              💙 Thank you!
            </div>
          </div>
        </section>
      </main>

      {/* ── Payment Details Modal ───────────────────────────── */}
      {activeModalMethod && (
        <div
          className="donation-modal-overlay"
          onClick={() => setActiveModalMethod(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="donation-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="donation-modal-close"
              onClick={() => setActiveModalMethod(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="donation-modal-header">
              <span className={`donation-modal-icon ${activeModalMethod.typeClass}`}>
                {activeModalMethod.icon}
              </span>
              <div>
                <h3 className="donation-modal-title">{activeModalMethod.name}</h3>
                <p className="donation-modal-subtitle">{activeModalMethod.detail}</p>
              </div>
            </div>

            <div className="donation-modal-body">
              <div className="donation-modal-qr">
                <div className="donation-modal-qr-placeholder">
                  <QrCode size={56} style={{ marginBottom: 6, color: '#334155' }} />
                  <span>Scan to donate via {activeModalMethod.name}</span>
                </div>
              </div>

              <div className="donation-modal-field">
                <div className="donation-modal-field-label">
                  {activeModalMethod.id === 'gcash' ? 'Mobile / Account' : 'Address / Account'}
                </div>
                <div className="donation-modal-field-val">
                  {activeModalMethod.addressOrUrl}
                </div>
              </div>

              {activeModalMethod.notes && (
                <p style={{ fontSize: 11, color: 'var(--dn-muted)', lineHeight: 1.4, margin: '8px 0 16px' }}>
                  ℹ️ {activeModalMethod.notes}
                </p>
              )}
            </div>

            <button
              type="button"
              className={`donation-modal-copy-btn${copied ? ' is-copied' : ''}`}
              onClick={() => handleCopy(activeModalMethod.addressOrUrl)}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied to clipboard!' : 'Copy to clipboard'}</span>
            </button>
          </div>
        </div>
      )}

      <SiteFooter
        className="footer credits-page-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
