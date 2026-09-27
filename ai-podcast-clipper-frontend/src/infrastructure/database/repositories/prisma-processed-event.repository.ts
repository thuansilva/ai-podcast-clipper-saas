import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import type { IProcessedEventRepository } from "~/domain/ports/processed-event-repository";

export class PrismaProcessedEventRepository implements IProcessedEventRepository {
  async tryMarkProcessed(eventId: string, eventType: string): Promise<boolean> {
    try {
      await db.processedWebhookEvent.create({
        data: { stripeEventId: eventId, eventType },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }
}
