'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * True once React owns the client tree.
 *
 * Server-rendered forms exist in the HTML before React hydrates. Inside that
 * window a submit control is handled by the browser, not by React, so the form is
 * submitted natively with its default method: a GET that appends every field value
 * to the URL. That would put passwords, case-note text and handover notes into the
 * address bar, browser history, reverse-proxy logs and monitoring systems.
 *
 * Every client form therefore keeps its submit control disabled until this hook
 * flips to true, and forms handling sensitive or operational data also carry
 * method="post" as a no-JavaScript fallback, so values can never be appended to a
 * query string. Nothing else changes for a hydrated form: React's own onSubmit
 * still calls preventDefault, so a working form never navigates natively at all.
 *
 * Implemented with useSyncExternalStore so the server snapshot is false and the
 * client snapshot is true. React compares the two after hydration and re-renders
 * once, which is exactly the moment the form becomes submit-capable; this also
 * avoids a cascading setState inside an effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
