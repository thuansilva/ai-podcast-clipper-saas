import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { makeSyncUserUseCase } from "~/infrastructure/factories/use-case-factories";
import { db } from "~/server/db";

interface WebhookEmailAddress {
  email_address: string;
}

interface ClerkWebhookEvent {
  data: {
    id: string;
    email_addresses?: WebhookEmailAddress[];
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
  type: string;
}

export async function POST(req: Request) {
  const webhookSecret = env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new NextResponse("CLERK_WEBHOOK_SECRET is not configured", {
      status: 500,
    });
  }

  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Error: Missing Svix headers", {
      status: 400,
    });
  }

  const payload = await req.text();
  const wh = new Webhook(webhookSecret);
  let evt: ClerkWebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as unknown as ClerkWebhookEvent;
  } catch (err) {
    console.error("Error: Could not verify webhook:", err);
    return new NextResponse("Error: Verification error", {
      status: 400,
    });
  }

  const eventType = evt.type;

  if (eventType === "user.created" || eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;

    if (!primaryEmail) {
      return new NextResponse("Error: User has no email", { status: 400 });
    }

    const fullName = [first_name, last_name].filter(Boolean).join(" ");
    const syncUserUseCase = makeSyncUserUseCase();

    await syncUserUseCase.execute({
      clerkUserId: id,
      email: primaryEmail,
      name: fullName || null,
      image: image_url ?? null,
    });
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      try {
        await db.user.delete({
          where: { id },
        });
      } catch (err) {
        console.warn(
          `User ${id} could not be deleted or was already removed:`,
          err
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}
