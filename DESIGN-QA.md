# Prism — validação da versão 0.10.0

A referência é a direção Prism aprovada pelo usuário: painéis claros, lavanda, biblioteca em cards e prévia lateral. A adaptação preserva esse desenho e oferece uma paleta escura com os mesmos controles.

## Verificação realizada

- Templates, CSS e script de produção renderizados em Chrome com um ambiente Foundry simulado e imagens de demonstração.
- Temas claro e escuro: textos, controles, foco e estado selecionado visíveis.
- Janelas de 980, 560 e 380 pixels: sem overflow horizontal no conteúdo.
- Editor abre com a preferência atual e acompanha alterações de tema sem substituir o canvas; navegação por setas disponível.
- Busca, favoritos, prévia e aplicação explícita cobertos pelos testes automatizados.
- Animações curtas e opção individual de movimento reduzido; preferência do sistema respeitada.

Resultado: a revisão visual da prévia e os 12 testes automatizados passaram. A execução em uma sessão real do Foundry, incluindo diálogos nativos e upload/relay em servidor, não foi feita neste ambiente.
