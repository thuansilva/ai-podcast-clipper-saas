/* ATENÇÃO: conteúdo com placeholders [A PREENCHER] — precisa de revisão jurídica e dos dados reais da empresa antes do go-live. */

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LegalPageLayout } from "~/components/legal/legal-page-layout";

export const metadata = {
  title: "Política de Reembolso | Podcast Clipper Studio",
  description: "Política de Cancelamento e Reembolso do Podcast Clipper Studio.",
};

export default async function RefundPage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <LegalPageLayout
      isAuthenticated={isAuthenticated}
      title="Política de Reembolso"
      lastUpdatedLabel="[A PREENCHER: data da última atualização]"
    >
      <p>
        Esta Política de Reembolso explica como funcionam os cancelamentos,
        as falhas de pagamento e os reembolsos/contestações (chargebacks)
        para assinaturas e pacotes de créditos do Podcast Clipper Studio,
        operado por <strong>[A PREENCHER: razão social]</strong>.
      </p>

      <section aria-labelledby="cancelamento-assinatura">
        <h2 id="cancelamento-assinatura">1. Cancelamento de assinatura</h2>
        <p>
          Você pode cancelar sua assinatura a qualquer momento pelo painel
          de cobrança. O cancelamento interrompe a renovação automática, mas
          o acesso aos recursos do plano continua disponível até o final do
          período já pago. Não há reembolso proporcional pelo tempo não
          utilizado dentro de um período já cobrado, exceto nas situações
          descritas abaixo.
        </p>
      </section>

      <section aria-labelledby="falha-pagamento">
        <h2 id="falha-pagamento">2. O que acontece se um pagamento falhar</h2>
        <p>
          Se a cobrança de uma renovação de assinatura falhar (por exemplo,
          cartão expirado ou saldo insuficiente), sua conta entra em um
          período de carência de <strong>3 (três) dias</strong> antes de
          qualquer suspensão de acesso. Durante esse período, você pode
          atualizar seus dados de pagamento no painel de cobrança para que a
          cobrança seja tentada novamente, sem interrupção do serviço. Se o
          pagamento não for regularizado dentro desses 3 dias, o acesso aos
          recursos pagos poderá ser suspenso até que a situação seja
          resolvida.
        </p>
      </section>

      <section aria-labelledby="reembolso-chargeback">
        <h2 id="reembolso-chargeback">3. Reembolsos e contestações (chargebacks)</h2>
        <p>
          Caso você solicite um reembolso junto ao nosso parceiro de
          pagamentos, ou abra uma contestação de cobrança (chargeback) junto
          à sua operadora de cartão, aplicamos as seguintes regras:
        </p>
        <ul>
          <li>
            Revogamos apenas os créditos referentes ao período de cobrança
            específico que foi reembolsado ou contestado — créditos de
            períodos de cobrança anteriores, já utilizados normalmente, não
            são afetados e não serão cobrados de volta.
          </li>
          <li>
            Um reembolso ou chargeback não suspende automaticamente o
            restante da sua conta: apenas os créditos do período afetado são
            revogados, e sua assinatura e demais períodos seguem o fluxo
            normal, salvo se houver reincidência ou necessidade de análise
            manual adicional.
          </li>
        </ul>
        <p>
          Essas regras existem para equilibrar a proteção contra uso
          indevido do sistema de reembolso com a garantia de que você não
          perde créditos de ciclos anteriores que já foram legitimamente
          utilizados.
        </p>
      </section>

      <section aria-labelledby="pacotes-creditos">
        <h2 id="pacotes-creditos">4. Pacotes de créditos avulsos (one-time)</h2>
        <p>
          Pacotes de créditos comprados de forma avulsa (sem recorrência)
          seguem as mesmas regras de reembolso descritas no item 3 acima: em
          caso de reembolso ou chargeback referente à compra do pacote, os
          créditos daquela compra específica são revogados.
        </p>
      </section>

      <section aria-labelledby="como-solicitar">
        <h2 id="como-solicitar">5. Como solicitar um reembolso</h2>
        <p>
          Para solicitar um reembolso ou tirar dúvidas sobre uma cobrança,
          entre em contato pelos canais descritos na nossa{" "}
          <Link href="/contact">página de Contato</Link>, ou diretamente para{" "}
          <strong>[A PREENCHER: e-mail de contato]</strong>.
        </p>
      </section>

      <section aria-labelledby="relacao-termos">
        <h2 id="relacao-termos">6. Relação com os Termos de Uso</h2>
        <p>
          Esta Política de Reembolso é parte integrante dos nossos{" "}
          <Link href="/terms">Termos de Uso</Link> e deve ser interpretada em
          conjunto com eles.
        </p>
      </section>
    </LegalPageLayout>
  );
}
