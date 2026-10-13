import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { env } from "~/env";
import {
  makeSyncUserUseCase,
  makeDeleteUserAccountUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { logger } from "~/lib/observability/logger";
import { withSpan } from "~/lib/observability/tracer";

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
    logger.error("Clerk webhook verification failed", { error: err });
    return new NextResponse("Error: Verification error", {
      status: 400,
    });
  }

  const eventType = evt.type;

  return withSpan(
    "clerk.webhook.handle",
    { "clerk.event.type": eventType },
    () => handleClerkEvent(eventType, evt.data)
  );
}

async function handleClerkEvent(
  eventType: string,
  data: ClerkWebhookEvent["data"]
): Promise<NextResponse> {
  if (eventType === "user.created" || eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = data;
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
    const { id } = data;
    if (id) {
      try {
        const deleteUserAccountUseCase = makeDeleteUserAccountUseCase();
        await deleteUserAccountUseCase.execute({ userId: id });
      } catch (err) {
        // Ao contrário de user.created/user.updated (erro de validação,
        // não vale retry), a limpeza de exclusão de conta é segura de
        // repetir (idempotente: usuário já anonimizado, arquivos já
        // deletados do storage são tolerados, assinatura já cancelada é
        // ignorada). Por isso, diferente do catch de verificação de
        // assinatura acima, aqui respondemos 5xx de propósito — mesmo
        // padrão de resiliência do webhook do Stripe
        // (`src/app/api/webhooks/stripe/route.ts`) — para que o Clerk
        // reentregue o evento em vez de perder silenciosamente uma
        // exclusão parcial (ex.: Stripe ou S3 fora do ar no momento).
        logger.error("Failed to delete/anonymize user account", {
          userId: id,
          error: err,
        });
        return new NextResponse("Error: Failed to process account deletion", {
          status: 500,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
