import { useEffect, useRef } from 'react'
import { registerBackHandler, type BackHandler } from '../services/backNavigation'

export function useBackHandler(enabled: boolean, handler: BackHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    return registerBackHandler(() => handlerRef.current())
  }, [enabled])
}
