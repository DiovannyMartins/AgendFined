import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de Privacidade — AgendFined" };

export default function PrivacidadePage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 24 de outubro de 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">1. Quem somos e quais dados coletamos</h2>
        <p>
          O AgendFined está em fase de estruturação e ainda não possui CNPJ constituído. O canal
          oficial é agendfined@outlook.com. Podemos tratar nome, telefone/WhatsApp, e-mail,
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
          pagamentos, segurança e cumprimento de obrigações legais.
          As bases legais podem incluir execução de contrato, obrigação legal, exercício regular de
          direitos e legítimo interesse. Quando houver consentimento, ele será específico e poderá ser revogado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">3. Compartilhamento, retenção e cookies</h2>
        <p>
          Não vendemos dados. Compartilhamos o mínimo necessário com Supabase (banco e autenticação),
          Resend (e-mails), Mercado Pago (pagamentos), Vercel (hospedagem), Google (Google Calendar,
          só quando o dono conecta) e autoridades quando exigido. Alguns operadores podem processar dados fora do Brasil, com salvaguardas legais.
          Guardamos dados pelo tempo necessário ao serviço, à segurança e às obrigações legais,
          eliminando ou anonimizando-os depois. Usamos cookies
          essenciais de sessão e segurança, sem cookies de publicidade comportamental nesta versão.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">4. Integração com o Google Calendar</h2>
        <p>
          A integração é opcional, faz parte do plano PROFISSIONAL e só é ativada quando o dono do
          negócio clica em “Conectar Google Calendar” e autoriza o acesso na própria conta do Google.
          O AgendFined pede ao Google o endereço de e-mail da conta, para mostrar qual conta está
          conectada, e a permissão “Ver e editar eventos em todas as suas agendas”, usada para criar,
          atualizar e apagar na agenda principal do dono só os eventos que ele mesmo cria, um para
          cada reserva confirmada. O AgendFined não lê, não altera e não apaga outros eventos da agenda.
        </p>
        <p>
          Cada evento leva o serviço, a data e o horário, o nome e telefone do cliente e a observação
          da reserva, para o dono ver o atendimento na própria agenda. Guardamos o e-mail da conta
          conectada e os tokens de acesso do Google criptografados, usados apenas para manter os
          eventos em dia. Esses dados não são usados para publicidade, não são vendidos, não são
          compartilhados com terceiros e não são usados para treinar modelos de inteligência
          artificial. Só são lidos por pessoas quando o dono pede suporte ou quando a lei exige.
        </p>
        <p>
          O dono pode encerrar o acesso a qualquer momento em Configurações → Google Calendar →
          Desconectar: o AgendFined revoga a autorização no Google e apaga os tokens guardados. Os
          eventos já criados continuam na agenda do dono. O acesso também pode ser removido em
          myaccount.google.com/permissions.
        </p>
        <p>
          O uso e a transferência, para qualquer outro app, das informações recebidas das APIs do
          Google pelo AgendFined seguem a{" "}
          <a
            className="underline underline-offset-4"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">5. Segurança e seus direitos</h2>
        <p>
          Adotamos controle de acesso, autenticação, isolamento por negócio e proteção de
          credenciais. Você pode solicitar confirmação, acesso, correção, anonimização, bloqueio,
          eliminação, portabilidade quando regulamentada, informações sobre compartilhamento,
          revogação do consentimento e revisão de decisões automatizadas, quando aplicável. Podemos
          confirmar sua identidade para proteger os dados.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">6. Contato e alterações</h2>
        <p>
          Para exercer direitos ou tirar dúvidas, escreva para agendfined@outlook.com. Em caso
          de incidente relevante, adotaremos as comunicações exigidas. Esta política pode ser
          atualizada e a versão vigente permanecerá publicada nesta página.
        </p>
      </section>
    </article>
  );
}
