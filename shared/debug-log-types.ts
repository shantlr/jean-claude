export interface DebugLogEntry {
  id: number;
  timestamp: string;
  namespace: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}
