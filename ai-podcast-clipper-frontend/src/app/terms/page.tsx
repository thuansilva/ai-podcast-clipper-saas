/* ATENÇÃO: conteúdo com placeholders [A PREENCHER] — precisa de revisão jurídica e dos dados reais da empresa antes do go-live. */

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LegalPageLayout } from "~/components/legal/legal-page-layout";

export const metadata = {
  title: "Termos de Uso | Podcast Clipper Studio",
  description: "Termos de Uso do Podcast Clipper Studio.",
};

export default async function TermsPage() {
  const { userId } = await auth();
  const isAuthenticated = Boolean(userId);

  return (
    <LegalPageLayout
      isAuthenticated={isAuthenticated}
      title="Termos de Uso"
      lastUpdatedLabel="[A PREENCHER: data da última atualização]"
    >
      <p>
        Estes Termos de Uso (&ldquo;Termos&rdquo;) regem o acesso e uso da
        plataforma Podcast Clipper Studio (&ldquo;Plataforma&rdquo;,
        &ldquo;Serviço&rdquo;), operada por{" "}
        <strong>[A PREENCHER: razão social]</strong>, inscrita no CNPJ sob o
        número <strong>[A PREENCHER: CNPJ]</strong>, com sede em{" "}
        <strong>[A PREENCHER: endereço]</strong> (&ldquo;nós&rdquo;,
        &ldquo;nossa empresa&rdquo;). Ao criar uma conta ou utilizar o
        Serviço, você (&ldquo;usuário&rdquo;, &ldquo;você&rdquo;) declara que
        leu, entendeu e concorda integralmente com estes Termos.
      </p>

      <section aria-labelledby="objeto">
        <h2 id="objeto">1. Objeto do serviço</h2>
        <p>
          O Podcast Clipper Studio é um serviço que processa vídeos de podcast
          enviados pelo usuário (por upload direto ou importação do YouTube)
          para gerar automaticamente cortes verticais curtos, com detecção do
          falante ativo e legendas, destinados a redes sociais como TikTok,
          Instagram Reels e YouTube Shorts.
        </p>
      </section>

      <section aria-labelledby="cadastro">
        <h2 id="cadastro">2. Cadastro e conta</h2>
        <p>
          Para usar o Serviço, você deve criar uma conta com um e-mail válido
          e senha, ou autenticar-se via provedores de login social
          suportados. Você é responsável por manter a confidencialidade das
          suas credenciais e por todas as atividades realizadas na sua conta.
          Você deve fornecer informações verdadeiras e mantê-las atualizadas.
        </p>
      </section>

      <section aria-labelledby="cobranca">
        <h2 id="cobranca">3. Cobrança, assinatura e créditos</h2>
        <p>
          O acesso a determinados recursos do Serviço é controlado por um
          sistema de créditos. Créditos podem ser obtidos por meio de planos
          de assinatura recorrente (cobrados mensal ou anualmente) ou pacotes
          avulsos (&ldquo;one-time&rdquo;), processados pelo nosso parceiro de
          pagamentos.
          Os valores, limites e benefícios de cada plano estão descritos na
          página de Preços da Plataforma e podem ser alterados mediante aviso
          prévio.
        </p>
        <p>
          Assinaturas são renovadas automaticamente ao final de cada ciclo de
          cobrança, salvo cancelamento prévio pelo usuário. O cancelamento
          pode ser feito a qualquer momento pelo painel de cobrança e produz
          efeitos a partir do fim do período já pago, sem reembolso
          proporcional do período em curso, exceto conforme descrito na nossa{" "}
          <Link href="/refund">Política de Reembolso</Link>.
        </p>
      </section>

      <section aria-labelledby="cancelamento">
        <h2 id="cancelamento">4. Cancelamento e reembolso</h2>
        <p>
          As regras detalhadas sobre carência em caso de falha de pagamento,
          reembolsos e contestações (chargebacks) estão descritas na nossa{" "}
          <Link href="/refund">Política de Reembolso</Link>, que é parte
          integrante destes Termos.
        </p>
      </section>

      <section aria-labelledby="conteudo-usuario">
        <h2 id="conteudo-usuario">5. Propriedade do conteúdo enviado pelo usuário</h2>
        <p>
          Você mantém todos os direitos de propriedade sobre os vídeos,
          áudios e demais materiais que enviar à Plataforma (&ldquo;Conteúdo
          do Usuário&rdquo;). Ao enviar Conteúdo do Usuário, você nos concede
          uma
          licença limitada, não exclusiva, para armazenar, processar e
          transformar esse conteúdo exclusivamente com a finalidade de
          prestar o Serviço (geração dos clipes solicitados). Você declara
          possuir todos os direitos necessários sobre o Conteúdo do Usuário
          enviado e é o único responsável por garantir que o envio e o uso
          desse conteúdo não violam direitos de terceiros (incluindo direitos
          de autor e de imagem).
        </p>
      </section>

      <section aria-labelledby="privacidade">
        <h2 id="privacidade">6. Privacidade e dados</h2>
        <p>
          O tratamento de dados pessoais realizado pela Plataforma está
          descrito na nossa <Link href="/privacy">Política de Privacidade</Link>,
          que é parte integrante destes Termos.
        </p>
      </section>

      <section aria-labelledby="limitacao">
        <h2 id="limitacao">7. Limitação de responsabilidade</h2>
        <p>
          O Serviço é fornecido &ldquo;como está&rdquo; e &ldquo;conforme
          disponível&rdquo;. Na
          máxima extensão permitida pela legislação aplicável, não nos
          responsabilizamos por danos indiretos, incidentais ou lucros
          cessantes decorrentes do uso ou da impossibilidade de uso da
          Plataforma, incluindo eventuais indisponibilidades, erros na
          detecção automática de momentos virais ou na geração de legendas.
          Nossa responsabilidade total, quando aplicável, está limitada ao
          valor efetivamente pago pelo usuário nos 12 (doze) meses anteriores
          ao evento que originou a reclamação.
        </p>
      </section>

      <section aria-labelledby="alteracoes">
        <h2 id="alteracoes">8. Alterações nestes Termos</h2>
        <p>
          Podemos atualizar estes Termos periodicamente. Alterações
          relevantes serão comunicadas por e-mail ou por aviso na Plataforma
          com antecedência razoável. O uso continuado do Serviço após a
          entrada em vigor das alterações constitui aceitação dos novos
          Termos.
        </p>
      </section>

      <section aria-labelledby="contato">
        <h2 id="contato">9. Contato</h2>
        <p>
          Dúvidas sobre estes Termos podem ser enviadas pelos canais
          descritos na nossa <Link href="/contact">página de Contato</Link>,
          ou diretamente para{" "}
          <strong>[A PREENCHER: e-mail de contato]</strong>.
        </p>
      </section>

      <section aria-labelledby="foro">
        <h2 id="foro">10. Lei aplicável e foro</h2>
        <p>
          Estes Termos são regidos pelas leis de{" "}
          <strong>[A PREENCHER: jurisdição]</strong>. Fica eleito o foro de{" "}
          <strong>[A PREENCHER: foro/comarca]</strong> para dirimir quaisquer
          controvérsias decorrentes destes Termos, com renúncia expressa a
          qualquer outro, por mais privilegiado que seja.
        </p>
      </section>
    </LegalPageLayout>
  );
}
