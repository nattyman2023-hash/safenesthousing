import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
export async function POST() { await destroySession(); return NextResponse.json({ ok: true }); }
export async function GET() { await destroySession(); return NextResponse.redirect(new URL('/staff/login', process.env.APP_URL ?? 'http://localhost:3000')); }
