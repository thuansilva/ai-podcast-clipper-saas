/* ATENÇÃO: conteúdo com placeholders [A PREENCHER] — precisa de revisão jurídica e dos dados reais da empresa antes do go-live. */

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LegalPageLayout } from "~/components/legal/legal-page-layout";

export const metadata = {
  title: "Contato | Podcast Clipper Studio",
  description: "Canais de contato e suporte do Podcast Clipper Studio.",
};

export default async function ContactPage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <LegalPageLayout
      isAuthenticated={isAuthenticated}
      title="Contato"
      lastUpdatedLabel="[A PREENCHER: data da última atualização]"
    >
      <p>
        Estamos à disposição para dúvidas sobre sua conta, cobrança,
        privacidade de dados ou qualquer outro assunto relacionado ao
        Podcast Clipper Studio.
      </p>

      <section aria-labelledby="suporte">
        <h2 id="suporte">Suporte e dúvidas gerais</h2>
        <p>
          E-mail:{" "}
          <a href="mailto:[A PREENCHER: e-mail de contato]">
            [A PREENCHER: e-mail de contato]
          </a>
        </p>
      </section>

      <section aria-labelledby="cobranca-contato">
        <h2 id="cobranca-contato">Cobrança e reembolsos</h2>
        <p>
          Para questões relacionadas a pagamentos, assinaturas ou
          reembolsos, consulte primeiro nossa{" "}
          <Link href="/refund">Política de Reembolso</Link> e, se precisar
          de ajuda adicional, escreva para{" "}
          <a href="mailto:[A PREENCHER: e-mail de contato]">
            [A PREENCHER: e-mail de contato]
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="dados-pessoais">
        <h2 id="dados-pessoais">Privacidade e dados pessoais</h2>
        <p>
          Para exercer seus direitos sobre dados pessoais (acesso,
          correção, exclusão ou portabilidade), descritos na nossa{" "}
          <Link href="/privacy">Política de Privacidade</Link>, escreva
          para{" "}
          <a href="mailto:[A PREENCHER: e-mail de contato]">
            [A PREENCHER: e-mail de contato]
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="endereco">
        <h2 id="endereco">Dados da empresa</h2>
        <p>
          <strong>[A PREENCHER: razão social]</strong>
          <br />
          CNPJ: <strong>[A PREENCHER: CNPJ]</strong>
          <br />
          Endereço: <strong>[A PREENCHER: endereço]</strong>
        </p>
      </section>
    </LegalPageLayout>
  );
}
