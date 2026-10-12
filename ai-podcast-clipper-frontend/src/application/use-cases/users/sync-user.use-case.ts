import type { UserEntity } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { SyncUserInput } from "~/application/dtos/user-dtos";
import { UserAlreadyExistsError } from "~/domain/errors/user-already-exists-error";
import { logger } from "~/lib/observability/logger";

export class SyncUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly paymentGateway: IPaymentGateway
  ) {}

  async execute(input: SyncUserInput): Promise<UserEntity> {
    const existingById = await this.userRepository.findById(input.clerkUserId);

    if (existingById) {
      return await this.updateExistingUser(input);
    }

    let stripeCustomerId: string | null = null;
    const existingByEmail = await this.userRepository.findByEmail(input.email);

    if (existingByEmail?.stripeCustomerId) {
      stripeCustomerId = existingByEmail.stripeCustomerId;
    } else {
      try {
        stripeCustomerId = await this.paymentGateway.createCustomer(
          input.email,
          input.name ?? null,
        );
      } catch (error) {
        // Decisão de produto (checklist-go-live.md, item "Fallback silencioso
        // de customer Stripe"): entre bloquear a criação do usuário até a
        // Stripe voltar (opção a) e deixar o usuário entrar com um
        // stripeCustomerId sentinela sinalizado para reconciliação manual
        // (opção b), optamos pela opção b. Bloquear a criação deixaria o
        // usuário sem conta mesmo quando a indisponibilidade é só da Stripe
        // (o app tem créditos gratuitos e funcionalidades que não dependem
        // de billing); além disso, `src/app/dashboard/layout.tsx` já chama
        // este mesmo use case como fallback caso o webhook do Clerk ainda
        // não tenha criado o usuário — se propagássemos a exceção aqui, o
        // carregamento do dashboard quebraria com um erro não tratado em vez
        // de simplesmente redirecionar/exibir a página. O sentinela
        // `cus_fallback_<clerkUserId>_<timestamp>` é reconhecível por
        // padrão (permite localizar via `stripeCustomerId LIKE
        // 'cus_fallback_%'` para reconciliação manual, sem depender só de
        // logs) e o log é emitido em nível ERROR (não WARN) com os dados
        // completos para investigação.
        stripeCustomerId = this.buildFallbackStripeCustomerId(input.clerkUserId);
        logger.error(
          "[SyncUserUseCase] Falha ao criar cliente no gateway de pagamento. Usuário criado com stripeCustomerId sentinela para reconciliação manual.",
          {
            clerkUserId: input.clerkUserId,
            email: input.email,
            fallbackStripeCustomerId: stripeCustomerId,
            error,
          },
        );
      }
    }

    try {
      return await this.userRepository.create({
        id: input.clerkUserId,
        email: input.email,
        name: input.name ?? null,
        image: input.image ?? null,
        credits: 10,
        reservedCredits: 0,
        stripeCustomerId,
      });
    } catch (error) {
      if (!(error instanceof UserAlreadyExistsError)) {
        throw error;
      }
      // Corrida de condição (webhook do Clerk reentregue/duplicado):
      // outra chamada concorrente passou pelo findById inicial encontrando
      // null e já terminou o create() antes desta. Confirma que o usuário
      // agora existe de fato (refetch por id) e segue o mesmo caminho
      // idempotente de update, em vez de propagar a violação de unicidade
      // ao chamador do webhook.
      const reconciled = await this.userRepository.findById(input.clerkUserId);
      if (!reconciled) {
        // Estado inconsistente (ex.: a outra chamada criou e já foi
        // removida por outro processo entre o conflito e este refetch):
        // não há "usuário já existente" para atualizar, então propaga o
        // erro original em vez de mascarar uma falha real.
        throw error;
      }
      return await this.updateExistingUser(input);
    }
  }

  private async updateExistingUser(input: SyncUserInput): Promise<UserEntity> {
    return await this.userRepository.update(input.clerkUserId, {
      email: input.email,
      name: input.name ?? null,
      image: input.image ?? null,
    });
  }

  private buildFallbackStripeCustomerId(clerkUserId: string): string {
    return `cus_fallback_${clerkUserId}_${Date.now()}`;
  }
}
