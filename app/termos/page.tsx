import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de Uso — AgendFined" };

export default function TermosPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 28 de setembro de 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">1. Identificação e aceitação</h2>
        <p>
          O AgendFined está em fase de estruturação e ainda não possui CNPJ constituído. O canal
          oficial é agendfined@outlook.com. Ao criar uma conta ou usar o serviço, você concorda
          com estes Termos e com a Política de Privacidade.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">2. O serviço</h2>
        <p>
          O AgendFined é uma plataforma de agendamento online que permite que profissionais e
          pequenos negócios ofereçam reservas de serviços por uma página pública. A plataforma
          fornece tecnologia, mas não é parte do contrato entre profissional e cliente e não garante
          a realização ou qualidade do serviço reservado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">3. Responsabilidades do usuário</h2>
        <p>
          Você é responsável por manter suas credenciais seguras e por garantir que os serviços e
          disponibilidades cadastrados reflitam a realidade do seu negócio. Reservas marcadas
          devem ser honradas. O profissional é responsável pela relação com seus clientes e pelo
          cumprimento das leis aplicáveis ao seu negócio.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">4. Uso aceitável e propriedade intelectual</h2>
        <p>
          É proibido usar o serviço para fins ilegais, inserir conteúdo fraudulento, coletar dados
          sem autorização, enviar spam, violar direitos de terceiros ou comprometer a segurança.
          O software, a marca e o layout pertencem ao AgendFined ou a seus licenciadores.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">5. Planos, pagamentos e suspensão</h2>
        <p>
          Valores e condições dos recursos pagos serão informados antes da contratação. Pagamentos
          podem ser processados pelo Mercado Pago. O cancelamento pode ser solicitado pelo painel
          ou pelo contato oficial; reembolsos observarão a oferta e a legislação aplicável.
          Podemos suspender ou encerrar contas que violem estes Termos, apresentem risco ou por
          determinação legal.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">6. Disponibilidade e responsabilidade</h2>
        <p>
          Podem ocorrer interrupções para manutenção, segurança ou fatores fora do nosso controle.
          O AgendFined não responde por informações inseridas pelos usuários, condutas de
          profissionais ou clientes ou falhas de terceiros, sem excluir responsabilidades que não
          possam ser afastadas pela legislação brasileira.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">7. Lei aplicável e contato</h2>
        <p>
          Estes Termos são regidos pelas leis brasileiras. Dúvidas, solicitações e notificações:
          agendfined@outlook.com. As partes buscarão resolver questões por esse canal antes de
          qualquer medida judicial, quando possível.
        </p>
      </section>
    </article>
  );
}
