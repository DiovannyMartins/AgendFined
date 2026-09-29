import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de Privacidade — AgendFined" };

export default function PrivacidadePage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 28 de setembro de 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">1. Quem somos e quais dados coletamos</h2>
        <p>
          O AgendFined está em fase de estruturação e ainda não possui CNPJ constituído. O canal
          oficial é reservas@agendfined.com.br. Podemos tratar nome, telefone/WhatsApp, e-mail,
          observações da reserva, dados do negócio, credenciais, IP, informações do dispositivo e
          registros técnicos de segurança. Não solicitamos dados sensíveis para o uso normal.
        </p>
        <p>
          Para fins da LGPD, o AgendFined atua como controlador dos dados tratados para operar a
          plataforma. O profissional também pode ser controlador dos dados de seus próprios clientes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">2. Finalidades e bases legais</h2>
        <p>
          Usamos os dados para contas, autenticação, reservas, confirmações, lembretes, suporte,
          pagamentos, segurança e cumprimento de obrigações legais. As bases legais podem incluir
          execução de contrato, obrigação legal, exercício regular de direitos e legítimo interesse.
          Quando houver consentimento, ele será específico e poderá ser revogado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">3. Compartilhamento, retenção e cookies</h2>
        <p>
          Não vendemos dados. Compartilhamos o mínimo necessário com Supabase (banco e autenticação),
          Resend (e-mails), Mercado Pago (pagamentos), Vercel (hospedagem) e autoridades quando
          exigido. Alguns operadores podem processar dados fora do Brasil, com salvaguardas legais.
          Guardamos dados pelo tempo necessário ao serviço, à segurança e às obrigações legais,
          eliminando ou anonimizando-os depois. Usamos cookies essenciais de sessão e segurança,
          sem cookies de publicidade comportamental nesta versão.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">4. Segurança e seus direitos</h2>
        <p>
          Adotamos controle de acesso, autenticação, isolamento por negócio e proteção de
          credenciais. Você pode solicitar confirmação, acesso, correção, anonimização, bloqueio,
          eliminação, portabilidade quando regulamentada, informações sobre compartilhamento,
          revogação do consentimento e revisão de decisões automatizadas, quando aplicável. Podemos
          confirmar sua identidade para proteger os dados.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">5. Contato e alterações</h2>
        <p>
          Para exercer direitos ou tirar dúvidas, escreva para reservas@agendfined.com.br. Em caso
          de incidente relevante, adotaremos as comunicações exigidas. Esta política pode ser
          atualizada e a versão vigente permanecerá publicada nesta página.
        </p>
      </section>
    </article>
  );
}
