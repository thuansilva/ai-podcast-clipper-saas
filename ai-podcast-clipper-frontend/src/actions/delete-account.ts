"use server";

import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";

/**
 * Server Action acionada pelo botão "Excluir conta" na UI
 * (`src/components/dashboard/delete-account-section.tsx`).
 *
 * Fonte única de verdade para a exclusão de conta é o webhook `user.deleted`
 * do Clerk (ver `DeleteUserAccountUseCase` +
 * `src/app/api/webhooks/clerk/route.ts`) — esta action NUNCA toca
 * diretamente no banco de dados. Ela apenas pede ao Clerk para deletar o
 * usuário, o que dispara o webhook de forma assíncrona e confiável.
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
  await makeAuthGateway().deleteUser(userId);
}
