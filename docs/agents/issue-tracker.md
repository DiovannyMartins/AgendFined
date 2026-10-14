# Issue tracker: GitHub

Issues e specs deste repositório vivem em [GitHub Issues](https://github.com/DiovannyMartins/AgendFined/issues). Use a CLI `gh` para operações no tracker.

## Convenções

- Criar: `gh issue create --title "..." --body "..."`
- Ler: `gh issue view <number> --json number,title,body,labels,comments`
- Listar: `gh issue list --state open --json number,title,body,labels,comments`
- Comentar: `gh issue comment <number> --body "..."`
- Aplicar/remover label: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- Fechar: `gh issue close <number> --comment "..."`

PRs externos não são tratados como superfície de triagem neste projeto. Quando uma skill disser “publicar no issue tracker”, crie uma issue no GitHub.
