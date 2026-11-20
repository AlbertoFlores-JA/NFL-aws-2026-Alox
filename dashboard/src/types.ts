export interface Game { gameId: number; week: number; date: string; home: string; visitor: string }
export interface PlaySummary {
  playId: number; quarter: number; clock: string; down: number | null; yardsToGo: number | null
  possession: string; passResult: string | null; description: string
}
export interface Player {
  id: number; name: string; team: string; side: 'off' | 'def'
  role: string | null; pos: string | null; jersey: number | null
}
export interface Edge { to: number; sep: number; nd: number; c: 'g' | 'y' | 'r' }
export interface Duel { a: number; b: number; d: number; red: boolean; key: boolean; kind: 'block' | 'sack' | 'contact' }
export interface Frame {
  f: number; ev: string[]; ball: [number, number] | null; p: ([number, number] | null)[]
  edges: Edge[]; duels: Duel[]; key: boolean; phase: 'pre' | 'qb' | 'post'; say: string
}
export interface Context {
  quarter: number; clock: string; down: number | null; yardsToGo: number | null
  formation: string | null; coverage: string | null; coverageType: string | null; coverageExplain: string
  passResult: string | null; passResultText: string; playResult: number | null
  description: string; downExplain: string; summary: string
}
export interface Play {
  gameId: number; playId: number; flipped: boolean; offense: string; defense: string
  snapFrame: number; releaseFrame: number | null; qbEndFrame: number
  players: Player[]; qbIndex: number | null; frames: Frame[]
  thresholds: { open: number; tight: number; duel: number }
  context: Context
}
