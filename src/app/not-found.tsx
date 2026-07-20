import Link from 'next/link';
export default function NotFound() { return <main><section className="not-found"><div className="container"><p className="eyebrow">404</p><h1>That page is not here.</h1><p className="muted">The link may have moved, or the content is not published.</p><Link className="button button-primary" href="/">Back to Safe Nest</Link></div></section></main>; }
