import { Home, Link2, Search } from 'lucide-react';
import { Link } from 'wouter';

export default function SeriesNotFound({ slug }: { slug: string }) {
  const path = `/series/${slug}`;

  return (
    <main className="series-404" aria-labelledby="series-404-title">
      <section className="series-404__content">
        <div className="series-404__number" aria-label="404">
          <span className="series-404__watermark" aria-hidden="true">404</span>
          <span className="series-404__digits" aria-hidden="true">4<span>0</span>4</span>
        </div>
        <div className="series-404__badge">PAGE NOT FOUND</div>
        <div className="series-404__divider" aria-hidden="true" />
        <h1 id="series-404-title">Oops! Nothing here.</h1>
        <p className="series-404__message">
          The series you’re looking for might have been removed or isn’t available. Try searching — you might find it in the{' '}
          <Link href="/series">series tab</Link>.
        </p>
        <div className="series-404__path"><Link2 size={15} aria-hidden="true" /><span>{path}</span></div>
        <nav className="series-404__actions" aria-label="Page not found navigation">
          <Link className="series-404__action series-404__action--primary" href="/"><Home size={17} /> Go Home</Link>
          <Link className="series-404__action" href="/series"><Search size={18} /> Browse Series</Link>
        </nav>
      </section>
    </main>
  );
}
