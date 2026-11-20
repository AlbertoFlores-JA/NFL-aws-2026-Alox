export interface GameInfo { gameId: number; week: number; date: string; home: string; visitor: string }
export interface PlayItem { playId: number; label: string }
export interface Header {
  home: string; visitor: string; homeScore: number; visitorScore: number
  quarter: number; downLabel: string; yardsToGo: number; clock: string | null
  offense: string; defense: string; formation: string | null
}
export interface Player { id: number; name: string; pos: string; jersey: number | null; side: 'off' | 'def'; role: string | null }
export interface Frame {
  f: number
  ball: [number, number] | null
  p: ([number, number] | null)[]
  s: (number | null)[]
  sep: Record<string, number>
  open: number[]
  pressure: number | null
  events: string[]
}
export interface PlayData {
  playId: number
  header: Header
  snapFrame: number
  releaseFrame: number | null
  lastFrame: number
  fps: number
  thresholds: { open: number; pressureFull: number; pressureZero: number }
  players: Player[]
  frames: Frame[]
  gauge: { value: number; when: string }
  coverage: { name: string | null; type: string | null; text: string }
  alerts: string[]
  keyPoints: string[]
  narration: string
  replay: string[]
  description: string | null
}
