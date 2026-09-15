/**
 * Value Object: Timestamp
 * Encapsula parsing, validação e formatação de timestamps no formato MM:SS ou HH:MM:SS.
 */
export class Timestamp {
  private readonly _seconds: number;

  private constructor(seconds: number) {
    this._seconds = Math.max(0, Math.floor(seconds));
  }

  public static fromSeconds(seconds: number): Timestamp {
    if (isNaN(seconds) || seconds < 0 || !Number.isFinite(seconds)) {
      return new Timestamp(0);
    }
    return new Timestamp(seconds);
  }

  /**
   * Converte string MM:SS ou HH:MM:SS para Timestamp.
   * Retorna null para valores nulos, vazios ou formatos inválidos.
   */
  public static parse(value: string): Timestamp | null {
    const seconds = Timestamp.parseToSeconds(value);
    if (seconds === null) return null;
    return new Timestamp(seconds);
  }

  public static parseToSeconds(value: string): number | null {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(trimmed)) {
      return null;
    }

    const parts = trimmed.split(":").map(Number);
    if (parts.some((p) => isNaN(p) || p < 0)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = parts as [number, number];
      if (seconds >= 60) return null;
      return minutes * 60 + seconds;
    }

    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts as [number, number, number];
      if (minutes >= 60 || seconds >= 60) return null;
      return hours * 3600 + minutes * 60 + seconds;
    }

    return null;
  }

  public static formatSeconds(seconds: number): string {
    if (isNaN(seconds) || seconds < 0 || !Number.isFinite(seconds)) return "00:00";
    const rounded = Math.floor(seconds);

    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${pad(minutes)}:${pad(secs)}`;
  }

  public toSeconds(): number {
    return this._seconds;
  }

  public format(): string {
    return Timestamp.formatSeconds(this._seconds);
  }

  public add(deltaSeconds: number): Timestamp {
    return new Timestamp(Math.max(0, this._seconds + deltaSeconds));
  }

  public equals(other: Timestamp): boolean {
    return this._seconds === other._seconds;
  }
}

// Funções de conveniência delegadas ao Value Object para retrocompatibilidade
export const parseTimestampToSeconds = (value: string): number | null =>
  Timestamp.parseToSeconds(value);

export const formatSecondsToTimestamp = (seconds: number): string =>
  Timestamp.formatSeconds(seconds);
export function addSecondsToTimestamp(
  currentTimestamp: string,
  deltaSeconds: number
): string {
  const currentSeconds = parseTimestampToSeconds(currentTimestamp) ?? 0;
  const targetSeconds = Math.max(0, currentSeconds + deltaSeconds);
  return formatSecondsToTimestamp(targetSeconds);
}
