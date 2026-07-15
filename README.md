# Mapa Estandes — Tattoo Week Brasília

Mapa **colaborativo** dos estandes da feira. Qualquer pessoa com o link edita o status
de cada estande (pendente / plantado / quente / cadastrado / ativado / sem interesse),
a zona, o caçador e a anotação — e **todo mundo vê ao vivo** (atualiza sozinho a cada 7s).

## Como funciona (leve, sem banco)

- **Frontend:** um `public/index.html` (mapa + interações).
- **Backend:** `server.js` — Node puro, **dependência zero**, ~180 linhas.
- **Dados:** um único arquivo `data.json`. Sem Postgres, sem MongoDB, sem nada.

## Rodar local

```bash
node server.js
# abre http://localhost:3000
```

## Deploy no Railway

1. Suba este repo no GitHub.
2. No Railway: **New Project → Deploy from GitHub repo** → escolha o repo.
3. Railway detecta Node e roda `npm start` (= `node server.js`). Não precisa configurar nada.
4. Em **Settings → Networking → Generate Domain** pra pegar o link público.

### Persistência entre deploys (opcional, recomendado)

O `data.json` fica no disco do container. Enquanto você **não fizer um novo deploy**, os
dados persistem normal (inclusive reinícios). Um redeploy zera. Pra nunca perder:

1. Railway → **New → Volume**, monte em `/data`.
2. Adicione a variável de ambiente `DATA_DIR=/data`.

Pronto — o `data.json` passa a viver no volume e sobrevive a qualquer deploy.
(De qualquer forma, o botão **⬇︎ Backup** exporta tudo pra um JSON a qualquer momento.)

### Senha da equipe (opcional)

Por padrão o link é **aberto** (qualquer um com a URL edita). Pra exigir senha:

- Railway → Variables → `APP_PASSWORD=suasenha`

Aí, ao editar, o app pede a senha uma vez e guarda no aparelho.

## Variáveis de ambiente

| Var | Padrão | Pra quê |
|---|---|---|
| `PORT` | `3000` | Porta (o Railway seta sozinho) |
| `DATA_DIR` | pasta do app | Onde guardar o `data.json` (aponte pro volume) |
| `APP_PASSWORD` | *(vazio)* | Se setada, exige senha pra editar |
