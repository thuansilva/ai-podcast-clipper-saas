"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { requestAccountDeletion } from "~/actions/delete-account";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";

/**
 * Seção "zona de risco" da página de faturamento. O botão aqui NUNCA toca
 * diretamente no banco de dados — ele só pede ao Clerk, via Server Action
 * (`requestAccountDeletion`), para deletar o usuário. É o webhook
 * `user.deleted` do Clerk que efetivamente limpa vídeos/clipes do S3,
 * cancela a assinatura no Stripe e anonimiza o cadastro (ver
 * `DeleteUserAccountUseCase`).
 *
 * O redirecionamento pós-exclusão é feito aqui no client (`router.push`),
 * não via `redirect()` dentro da Server Action: o botão de confirmação vive
 * num `AlertDialog` (Radix) que se fecha/desmonta imediatamente ao ser
 * clicado, o que destruiria a transição que precisaria sobreviver para o
 * erro especial de `redirect()` chegar até o Error Boundary do App Router.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await requestAccountDeletion();
      // A sessão do Clerk deixará de ser válida assim que o usuário for
      // removido — navega para uma página pública em vez de deixar o
      // usuário num dashboard autenticado que vai falhar na próxima
      // navegação.
      router.push("/");
    } catch (error) {
      setIsDeleting(false);
      console.error("Erro ao excluir a conta:", error);
      toast.error("Erro ao excluir a conta. Tente novamente.");
    }
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <TriangleAlert className="size-4" />
          Zona de risco
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-[var(--fumaca)] leading-relaxed">
          Excluir sua conta cancela sua assinatura e apaga permanentemente
          todos os seus vídeos e clipes armazenados. Essa ação não pode ser
          desfeita.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Excluindo conta...
                </>
              ) : (
                "Excluir minha conta"
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
              <AlertDialogDescription>
                Seus vídeos e clipes serão apagados de verdade e sua
                assinatura será cancelada. Essa ação não tem volta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleConfirmDelete}
              >
                Sim, excluir minha conta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
