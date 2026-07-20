'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type NewsPost = { id: string; title: string; summary: string; content: string; authorName: string; published: boolean; category: { name: string } };

export function NewsContentForm({ post }: { post: NewsPost }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const response = await fetch(`/api/crm/content/news/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Saved'); router.refresh(); } else setMessage(result.error ?? 'Unable to save');
    setBusy(false);
  }
  return <form className="form-grid" onSubmit={submit}>{message && <div className={message === 'Saved' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor={`news-title-${post.id}`}>Title</label><input id={`news-title-${post.id}`} name="title" defaultValue={post.title} required /></div><div className="form-field"><label htmlFor={`news-author-${post.id}`}>Author</label><input id={`news-author-${post.id}`} name="authorName" defaultValue={post.authorName} required /></div><div className="form-field full"><label htmlFor={`news-summary-${post.id}`}>Summary</label><textarea id={`news-summary-${post.id}`} name="summary" defaultValue={post.summary} required /></div><div className="form-field full"><label htmlFor={`news-content-${post.id}`}>Content</label><textarea id={`news-content-${post.id}`} name="content" defaultValue={post.content} required /></div><div className="form-field"><label>Category</label><input value={post.category.name} readOnly /></div><div className="form-field"><label className="checkbox-row"><input type="checkbox" name="published" defaultChecked={post.published} /> Published on the public site</label></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save news post'}</button></div></form>;
}
