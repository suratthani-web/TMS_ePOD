"use client";

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

import { useIdle } from '@/components/providers/idle-provider';

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  commit_timestamp: string;
  errors: string[] | null;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export function useRealtime(table: string, callback: (payload: RealtimePayload) => void) {
  const { isIdle } = useIdle();
  const callbackRef = useRef(callback);

  // Keep callback reference updated with the latest value
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (isIdle) return; // Stop listening if idle

    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, and DELETE
          schema: 'public',
          table: table,
        },
        (payload) => {
          console.log(`Real-time update for ${table}:`, payload);
          callbackRef.current(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, isIdle]);
}
