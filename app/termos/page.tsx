import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — AgendFined",
  alternates: { canonical: "/termos" },
};

export default function TermosPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 1º de novembro de 2026</p>

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
        <h2 className="text-xl font-medium">5. Plano, teste grátis, pagamentos e suspensão</h2>
        <p>
          O AgendFined tem um plano único, o Plano AgendFined, uma assinatura recorrente mensal com
          todos os recursos; o preço vigente e as condições da cobrança são apresentados na oferta e
          no checkout antes da confirmação. O pagamento é processado pelo Mercado Pago. A assinatura
          passa a valer depois que é autorizada pelo provedor; o retorno do navegador ao AgendFined,
          sozinho, não confirma o pagamento.
        </p>
        <p>
          Cada pessoa tem direito a um teste grátis de 30 dias corridos, contados da criação do
          negócio, com todos os recursos e sem cadastro de cartão. O teste é concedido uma única
          vez: um negócio cujo telefone ou cujo e-mail do dono já tenha recebido um teste, inclusive
          em uma conta excluída, é criado sem teste. Casos legítimos, como um negócio que trocou de
          dono e manteve o telefone, podem ser analisados pelo canal oficial.
        </p>
        <p>
          Quem assina durante o teste não perde os dias restantes: a primeira cobrança acontece na
          data do fim do teste, podendo variar em até 1 dia por causa do processamento do Mercado
          Pago, e as seguintes a cada mês a partir dela. Se o teste terminar no mesmo dia da
          assinatura, a primeira cobrança é feita na hora. Fora do teste, a cobrança começa na
          assinatura.
        </p>
        <p>
          Sem teste vigente e sem assinatura em dia, o negócio fica suspenso. Nada é apagado:
          serviços, clientes, reservas e o endereço da página pública são preservados. Enquanto
          estiver suspenso, a página pública não aceita novas reservas nem entradas na lista de
          espera, as automações (lembretes, avisos da lista de espera e sincronização com o Google
          Calendar) ficam paradas e o painel permite consultar os dados, cancelar reservas, assinar e
          gerenciar a conta. As reservas já marcadas continuam valendo e podem ser canceladas pelo
          cliente e pelo dono. Ao assinar, o negócio volta a funcionar normalmente.
        </p>
        <p>
          A assinatura pode ser cancelada pelo painel ou pelo canal oficial. Após o cancelamento,
          novas cobranças são interrompidas conforme o processamento do Mercado Pago e o acesso
          continua até o fim do período mensal já pago, e por no mínimo 7 dias, inclusive quando a
          assinatura é cancelada durante o teste, antes da primeira cobrança. Encerrado esse período
          sem uma nova autorização, o negócio fica suspenso. Uma assinatura pausada por falha de
          pagamento inicia uma carência de 7 dias. Esta carência operacional não substitui nem limita
          o direito de arrependimento previsto na legislação aplicável.
        </p>
        <p>
          Quando a contratação se enquadrar como relação de consumo realizada fora do
          estabelecimento comercial, o direito de arrependimento poderá ser exercido nos prazos e
          condições previstos em lei pelo canal oficial agendfined@outlook.com. O pedido será
          analisado e, quando aplicável, encaminhado ao Mercado Pago para as providências relativas
          à cobrança. A aplicação dessas regras depende das circunstâncias da contratação e não
          afasta direitos previstos em lei. Podemos suspender ou encerrar contas que violem estes
          Termos, apresentem risco ou por determinação legal.
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
