/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { db } from "~/server/db";
import { PrismaUploadedFileRepository } from "~/infrastructure/database/repositories/prisma-uploaded-file.repository";
import { isManualCut } from "~/domain/services/clip-origin.service";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

describe("Origem do clipe (Corte Manual) com Postgres real", () => {
  useRollbackTransactionPerTest();

  async function createUser() {
    const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return db.user.create({
      data: {
        id: `user_origin_${suffix}`,
        email: `origin-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        reservedCredits: 0,
      },
    });
  }

  it("repo.create persiste manualCutsJson e o clipe do projeto é manual; projeto automático não", async () => {
    const user = await createUser();
    const repo = new PrismaUploadedFileRepository();
    const cuts = JSON.stringify([{ title: "Corte 1", startTime: 0, endTime: 20 }]);

    const manual = await repo.create({
      userId: user.id,
      s3Key: `youtube/manual-${Date.now()}.mp4`,
      sourceType: "YOUTUBE",
      manualCutsJson: cuts,
    });
    const auto = await repo.create({
      userId: user.id,
      s3Key: `youtube/auto-${Date.now()}.mp4`,
      sourceType: "YOUTUBE",
    });

    const clipData = (uploadedFileId: string, viralityScore: number | null) => ({
      userId: user.id,
      uploadedFileId,
      s3Key: `clips/${uploadedFileId}.mp4`,
      title: "Clip",
      viralityScore,
      hook: viralityScore === null ? null : "gancho",
    });
    await db.clip.create({ data: clipData(manual.id, null) });
    await db.clip.create({ data: clipData(auto.id, 9) });

    const manualProject = await db.uploadedFile.findUniqueOrThrow({
      where: { id: manual.id },
      include: { clips: true },
    });
    const autoProject = await db.uploadedFile.findUniqueOrThrow({
      where: { id: auto.id },
      include: { clips: true },
    });

    expect(manualProject.manualCutsJson).toBe(cuts);
    expect(autoProject.manualCutsJson).toBeNull();
    expect(isManualCut(manualProject.clips[0]!, manualProject)).toBe(true);
    expect(isManualCut(autoProject.clips[0]!, autoProject)).toBe(false);
  });
});
