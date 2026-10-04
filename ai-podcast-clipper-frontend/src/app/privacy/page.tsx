/* ATENÇÃO: conteúdo com placeholders [A PREENCHER] — precisa de revisão jurídica e dos dados reais da empresa antes do go-live. */

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LegalPageLayout } from "~/components/legal/legal-page-layout";

export const metadata = {
  title: "Política de Privacidade | Podcast Clipper Studio",
  description: "Política de Privacidade do Podcast Clipper Studio.",
};

export default async function PrivacyPage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <LegalPageLayout
      isAuthenticated={isAuthenticated}
      title="Política de Privacidade"
      lastUpdatedLabel="[A PREENCHER: data da última atualização]"
    >
      <p>
        Esta Política de Privacidade descreve como{" "}
        <strong>[A PREENCHER: razão social]</strong>, inscrita no CNPJ sob o
        número <strong>[A PREENCHER: CNPJ]</strong> (&ldquo;nós&rdquo;),
        coleta, usa, armazena e protege os dados pessoais dos usuários do
        Podcast Clipper Studio (&ldquo;Plataforma&rdquo;).
      </p>

      <section aria-labelledby="dados-coletados">
        <h2 id="dados-coletados">1. Quais dados coletamos</h2>
        <ul>
          <li>Dados de cadastro: e-mail e senha (ou login social).</li>
          <li>
            Conteúdo enviado por você: arquivos de vídeo/áudio enviados para
            processamento ou links de vídeos do YouTube informados por você.
          </li>
          <li>
            Dados de cobrança: informações de pagamento, histórico de
            assinatura e transações de créditos, processadas pelo nosso
            parceiro de pagamentos.
          </li>
          <li>
            Dados de uso: registros técnicos de acesso e utilização da
            Plataforma, necessários para operação, segurança e suporte.
          </li>
        </ul>
      </section>

      <section aria-labelledby="finalidade">
        <h2 id="finalidade">2. Para que usamos seus dados</h2>
        <p>
          Usamos seus dados para: (i) criar e manter sua conta; (ii)
          processar os vídeos enviados e gerar os clipes solicitados; (iii)
          processar pagamentos e gerenciar sua assinatura/créditos; (iv)
          enviar comunicações operacionais (ex.: confirmação de cadastro,
          avisos de cobrança); e (v) melhorar e proteger a Plataforma contra
          fraude e abuso.
        </p>
      </section>

      <section aria-labelledby="compartilhamento">
        <h2 id="compartilhamento">3. Com quem compartilhamos seus dados</h2>
        <p>
          Compartilhamos dados apenas com fornecedores que nos ajudam a
          operar o Serviço, nos limites necessários para cada finalidade,
          incluindo: provedores de autenticação, de processamento de
          pagamentos, de armazenamento de arquivos em nuvem e de
          infraestrutura de processamento de vídeo. Não vendemos dados
          pessoais a terceiros.
        </p>
      </section>

      <section aria-labelledby="retencao">
        <h2 id="retencao">4. Retenção e exclusão de dados</h2>
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa ou conforme
          necessário para cumprir obrigações legais. Arquivos de vídeo
          enviados e os clipes gerados seguem regras de ciclo de vida de
          armazenamento que podem resultar em exclusão automática após um
          determinado período de inatividade. Você pode solicitar a exclusão
          da sua conta e dos seus dados pessoais pelos canais descritos na
          nossa <Link href="/contact">página de Contato</Link>.
        </p>
      </section>

      <section aria-labelledby="direitos">
        <h2 id="direitos">5. Seus direitos</h2>
        <p>
          Você pode solicitar, a qualquer momento, acesso, correção,
          portabilidade ou exclusão dos seus dados pessoais, bem como
          revogar consentimentos previamente concedidos, enviando sua
          solicitação para <strong>[A PREENCHER: e-mail de contato]</strong>.
        </p>
      </section>

      <section aria-labelledby="seguranca">
        <h2 id="seguranca">6. Segurança</h2>
        <p>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger
          seus dados contra acesso não autorizado, perda ou alteração
          indevida. Nenhum sistema é totalmente livre de riscos; caso
          identifiquemos um incidente de segurança relevante, notificaremos
          os usuários afetados conforme exigido pela legislação aplicável.
        </p>
      </section>

      <section aria-labelledby="alteracoes-privacidade">
        <h2 id="alteracoes-privacidade">7. Alterações nesta Política</h2>
        <p>
          Podemos atualizar esta Política de Privacidade periodicamente.
          Alterações relevantes serão comunicadas por e-mail ou por aviso na
          Plataforma com antecedência razoável.
        </p>
      </section>

      <section aria-labelledby="contato-privacidade">
        <h2 id="contato-privacidade">8. Contato</h2>
        <p>
          Dúvidas sobre esta Política podem ser enviadas pelos canais
          descritos na nossa <Link href="/contact">página de Contato</Link>,
          ou diretamente para{" "}
          <strong>[A PREENCHER: e-mail de contato]</strong>.
        </p>
      </section>

      <section aria-labelledby="foro-privacidade">
        <h2 id="foro-privacidade">9. Lei aplicável</h2>
        <p>
          Esta Política é regida pelas leis de{" "}
          <strong>[A PREENCHER: jurisdição]</strong>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
