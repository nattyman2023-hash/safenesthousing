import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { newsContentSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('content.write');
    const parsed = newsContentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the news content.' }, { status: 400 });
    const post = await db.newsPost.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!post) return NextResponse.json({ error: 'News post not found.' }, { status: 404 });
    const updated = await db.newsPost.update({ where: { id: post.id }, data: { ...parsed.data, publishedAt: parsed.data.published ? (post.publishedAt ?? new Date()) : null } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'NEWS_CONTENT_UPDATED', resourceType: 'NewsPost', resourceId: post.id, before: { published: post.published }, after: { published: updated.published, fields: Object.keys(parsed.data) } });
    return NextResponse.json({ id: updated.id, published: updated.published });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save news content.' : message }, { status });
  }
}
