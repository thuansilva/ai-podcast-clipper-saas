"use server";

import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeCancelUserSubscriptionUseCase } from "~/infrastructure/factories/use-case-factories";

/**
 * Server Action acionada pelo botão "Excluir conta" na UI
 * (`src/components/dashboard/delete-account-section.tsx`).
 *
 * O cancelamento da assinatura Stripe (dinheiro) precisa de confirmação
 * imediata: por isso esta action chama `CancelUserSubscriptionUseCase`
 * diretamente e espera a confirmação do Stripe ANTES de pedir ao Clerk para
 * deletar o usuário. Se o cancelamento falhar, o erro é propagado e o Clerk
 * nunca chega a ser chamado — o usuário continua com a conta ativa e pode
 * tentar excluir de novo.
 *
 * A exclusão de dados (vídeos/clipes do S3, linhas do banco, anonimização do
 * cadastro) continua sendo feita de forma assíncrona pelo webhook
 * `user.deleted` do Clerk (ver `DeleteUserAccountUseCase` +
 * `src/app/api/webhooks/clerk/route.ts`), disparado depois que
 * `makeAuthGateway().deleteUser` é chamado abaixo — essa parte não precisa
 * de confirmação síncrona. `DeleteUserAccountUseCase` também chama o
 * cancelamento de assinatura de novo (idempotente) como rede de segurança
 * para quando a exclusão é disparada de outro jeito (ex.: admin deleta o
 * usuário direto no painel do Clerk).
 *
 * Não chama `redirect()` aqui de propósito: o botão de confirmação vive
 * dentro de um `AlertDialog` (Radix) que se fecha — e desmonta — assim que
 * é clicado, o que destruiria a transição/Fiber que precisaria sobreviver
 * para o erro especial de `redirect()` chegar até o Error Boundary do App
 * Router. O componente client (`DeleteAccountSection`) é quem navega para
 * a página pública, com `router.push`, só depois de confirmar que esta
 * action terminou com sucesso.
 */
export async function requestAccountDeletion(): Promise<void> {
  const userId = await makeAuthGateway().requireUserId();

  // Cancela a assinatura primeiro: só avançamos para deletar o usuário no
  // Clerk se a Stripe confirmou que o cancelamento (ou a ausência de
  // assinatura) foi bem-sucedido.
  await makeCancelUserSubscriptionUseCase().execute({ userId });

  await makeAuthGateway().deleteUser(userId);
}
