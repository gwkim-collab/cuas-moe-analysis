// Shared 60fps telemetry ref context.
//
// Cesium scenes (main + mini EO FWD view) read U10 position / heading
// every frame via `telRef.current` to keep camera motion smooth, while
// React-rendered HUD continues to consume the reactive `tel` prop at
// the 4Hz scenario tick rate. This split decouples render rate from
// React's reconciliation cadence — the same trick the main map uses
// for entity positions.

import { createContext } from 'react'
import type { MutableRefObject } from 'react'
import type { CUASTelemetry } from './types'

export const TelRefContext = createContext<MutableRefObject<CUASTelemetry> | null>(null)
