// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef } from 'react'
import { subscribeEvents } from './api'

// useRealtime calls onChange whenever the server publishes a change to one of
// the given resources ("parts", "stock", "locations", "categories"). The
// subscription is stable across onChange identity changes so it doesn't churn
// the shared SSE connection.
export function useRealtime(resources: string[], onChange: () => void) {
  const cb = useRef(onChange)
  // Updated in an effect rather than during render: writing a ref while
  // rendering is not safe under concurrent rendering, and the callback is only
  // ever read later from the SSE subscription, never during a render pass.
  useEffect(() => {
    cb.current = onChange
  }, [onChange])
  const key = resources.join(',')

  useEffect(() => {
    const set = new Set(key.split(','))
    return subscribeEvents((resource) => {
      if (set.has(resource)) cb.current()
    })
  }, [key])
}
