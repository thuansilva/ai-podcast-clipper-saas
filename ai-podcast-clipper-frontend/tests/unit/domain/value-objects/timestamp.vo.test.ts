import { describe, it, expect } from "vitest";
import {
  Timestamp,
  parseTimestampToSeconds,
  formatSecondsToTimestamp,
  addSecondsToTimestamp,
} from "~/domain/value-objects/timestamp.vo";

describe("Timestamp (Value Object)", () => {
  describe("Timestamp Class", () => {
    it("deve instanciar a partir de segundos via fromSeconds", () => {
      const ts = Timestamp.fromSeconds(75);
      expect(ts.toSeconds()).toBe(75);
      expect(ts.format()).toBe("01:15");
    });

    it("deve instanciar a partir de string via parse", () => {
      const ts1 = Timestamp.parse("01:15");
      expect(ts1?.toSeconds()).toBe(75);
      expect(ts1?.format()).toBe("01:15");

      const ts2 = Timestamp.parse("01:02:15");
      expect(ts2?.toSeconds()).toBe(3735);
      expect(ts2?.format()).toBe("01:02:15");
    });

    it("deve retornar null para strings inválidas", () => {
      expect(Timestamp.parse("invalido")).toBeNull();
      expect(Timestamp.parse("")).toBeNull();
      expect(Timestamp.parse("-01:20")).toBeNull();
      expect(Timestamp.parse("00:75")).toBeNull();
    });

    it("deve adicionar segundos respeitando piso mínimo zero", () => {
      const ts = Timestamp.fromSeconds(30);
      const added = ts.add(45);
      expect(added.toSeconds()).toBe(75);

      const subtracted = ts.add(-50);
      expect(subtracted.toSeconds()).toBe(0);
    });

    it("deve comparar igualdade de valor entre dois Timestamps", () => {
      const ts1 = Timestamp.fromSeconds(90);
      const ts2 = Timestamp.parse("01:30");
      expect(ts1.equals(ts2!)).toBe(true);
    });
  });

  describe("Funções de conveniência", () => {
    it("parseTimestampToSeconds converte MM:SS e HH:MM:SS", () => {
      expect(parseTimestampToSeconds("00:30")).toBe(30);
      expect(parseTimestampToSeconds("01:15")).toBe(75);
      expect(parseTimestampToSeconds("01:02:15")).toBe(3735);
      expect(parseTimestampToSeconds("invalido")).toBeNull();
    });

    it("formatSecondsToTimestamp formata corretamente", () => {
      expect(formatSecondsToTimestamp(30)).toBe("00:30");
      expect(formatSecondsToTimestamp(75)).toBe("01:15");
      expect(formatSecondsToTimestamp(3735)).toBe("01:02:15");
      expect(formatSecondsToTimestamp(-10)).toBe("00:00");
    });

    it("addSecondsToTimestamp soma segundos a um timestamp", () => {
      expect(addSecondsToTimestamp("01:15", 30)).toBe("01:45");
      expect(addSecondsToTimestamp("00:10", -30)).toBe("00:00");
      expect(addSecondsToTimestamp("invalido", 30)).toBe("00:30");
    });
  });
});
