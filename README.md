# Tuk Tuk Lisbon — Site estático

Site institucional 100 % estático (HTML + CSS + JS). Sem build, sem dependências de servidor.

## Estrutura

```
index.html   ← página única
i18n.js      ← traduções PT / EN / ES
app.js       ← lógica (carrosséis, idioma, formulário WhatsApp)
vercel.json  ← config de deploy (cache de assets)
```

## Como editar

Diga-me em linguagem natural, ex.:
- "Muda o preço do Belém para €200"
- "Adiciona uma foto à galeria"
- "Troca o título do hero"

Eu edito o ficheiro certo, faço commit no GitHub, e o Vercel republica o site em ~30 segundos.

## Deploy no Vercel (uma vez)

1. **GitHub** — cria um repositório (ex: `tuktuk-lisbon-site`) e faz push destes ficheiros.
2. **Vercel** — entra em [vercel.com](https://vercel.com), faz login com GitHub.
3. **New Project** → escolhe o repositório → mantém tudo nos defaults → **Deploy**.
4. **Domínio** — em *Settings → Domains* adiciona `tuktuklisbon.tours` e segue as instruções DNS.

Pronto. Cada `git push` para `main` republica automaticamente.

## Local (opcional)

Para abrir localmente basta clicar duas vezes no `index.html`, ou correr:

```bash
npx serve .
```

## Reviews Google (Trustindex)

O placeholder está em `index.html` na div `#trustindex-container`. Para activar em produção, cole lá o snippet do Trustindex.
