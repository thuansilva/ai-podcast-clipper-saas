import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { makeSyncUserUseCase } from "~/infrastructure/factories/use-case-factories";
import { inngest } from "~/inngest/client";
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
        // A limpeza de verdade (cancelar assinatura, apagar arquivos do S3,
        // anonimizar o cadastro e apagar as linhas do banco) NÃO roda mais
        // de forma síncrona dentro deste handler de webhook — ela foi
        // movida para a function do Inngest `deleteUserAccount`
        // (`src/inngest/functions.ts`), que a executa em `step.run`s
        // separados com `retries: 3` (retry granular: um passo que já
        // concluiu com sucesso não é reexecutado quando outro falha) e
        // `onFailure` para visibilidade (log estruturado) caso os retries se
        // esgotem. Isso evita o problema do webhook síncrono: se a limpeza
        // falhasse no meio, o Clerk só podia reentregar o webhook inteiro
        // (sem retry por etapa), repetindo do zero passos que já tinham
        // dado certo.
        //
        // Aqui só despachamos o evento e respondemos rápido — é o padrão
        // correto para webhook + fila (confirmar recebimento, não
        // conclusão). Se o próprio despacho falhar (ex.: Inngest fora do
        // ar), nada foi processado ainda, então é seguro pedir ao Clerk
        // para reentregar o webhook inteiro.
        await inngest.send({
          name: "clerk/user.deleted",
          data: { userId: id },
        });
      } catch (err) {
        logger.error("Failed to dispatch account deletion event to Inngest", {
          userId: id,
          error: err,
        });
        return new NextResponse("Error: Failed to enqueue account deletion", {
          status: 500,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
