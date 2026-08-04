import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type RealtimeCallback = (payload: Record<string, unknown>) => void

export function useRealtimeTable(
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  callback: RealtimeCallback,
  filter?: string,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const channelName = `${table}-${event}-${filter ?? 'all'}-${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => callbackRef.current(payload as Record<string, unknown>),
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [table, event, filter])
}

export function useRealtimeChannel(channelName: string, event: string, callback: RealtimeCallback) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event }, (payload) => callbackRef.current(payload))
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [channelName, event])
}
