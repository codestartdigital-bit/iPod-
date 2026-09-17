# iPod

Tocador de MP3 com a interface, a navegação e a experiência do **iPod Classic (6ª geração)**, feito para rodar em tela cheia no iPhone como aplicativo instalado (PWA).

---

## 1. Resumo executivo

| Item | Situação |
|---|---|
| Interface | Réplica do iPod Classic 6G: barra de status, menus em split view, Cover Flow, Tocando Agora, Relógio, Cronômetro, Ajustes |
| Click Wheel | Funcional: giro com aceleração, 4 botões, botão central, toque longo, clicker sonoro |
| Biblioteca | Importação de arquivos locais, leitura de tags ID3v1/v2, MP4/M4A, FLAC, capas de álbum |
| Armazenamento | 100% local no aparelho (IndexedDB). Nada é enviado para servidor algum |
| Offline | Total, via Service Worker + IndexedDB |
| Dependências | **Nenhuma.** HTML, CSS e JavaScript puro (ES modules) |

---

## 2. Como usar no iPhone

### 2.1 Instalar

1. Publique a pasta em qualquer hospedagem **HTTPS** (ver seção 6) e abra o endereço no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone criado. O app roda em tela cheia, sem barra do navegador.

> Instalar na Tela de Início não é opcional: é o que garante tela cheia, o clicker sonoro e a persistência da biblioteca (seção 5.3).

### 2.2 Adicionar suas músicas

No aparelho: **Ajustes → Adicionar Músicas** (ou **Adicionar Músicas** no menu inicial, quando a biblioteca está vazia).

O seletor do iOS abre e permite escolher arquivos de:

- app **Arquivos** (memória do iPhone),
- **iCloud Drive**,
- Google Drive, Dropbox, OneDrive e outros provedores instalados,
- qualquer pasta compartilhada pelo Mac/PC.

Selecione vários arquivos de uma vez. O app lê título, artista, álbum, gênero, ano, número da faixa e a **capa embutida**, mede a duração real e grava tudo no aparelho.

No computador, também é possível **arrastar e soltar** os arquivos sobre a janela.

### 2.3 Formatos aceitos

| Formato | Situação no iOS/Safari |
|---|---|
| MP3 | Suportado |
| M4A / AAC (sem DRM) | Suportado |
| WAV / AIFF | Suportado |
| FLAC | Suportado nas versões recentes do iOS |
| OGG / Opus | Geralmente **não** suportado pelo Safari |

Arquivos que o navegador não consegue decodificar são importados mas sinalizados ao final da importação, e são pulados automaticamente durante a reprodução.

---

## 3. Controles (idênticos ao aparelho original)

### Click Wheel

| Gesto | Ação |
|---|---|
| Girar o aro | Rola a lista (com aceleração ao girar rápido) |
| Girar em **Tocando Agora** | Volume |
| **Centro** | Selecionar / tocar |
| **Centro** em Tocando Agora | Alterna: Volume → Avançar/Retroceder → Avaliação (estrelas) |
| **Centro** (segurar) sobre uma música | Adiciona à playlist **Lista Rápida** |
| **MENU** | Voltar |
| **MENU** (segurar) | Volta direto ao menu principal |
| **▶❙❙** | Tocar / pausar |
| **▶❙❙** (segurar) | Apaga a tela (dorme) |
| **❙◀◀** | Música anterior (ou reinicia, se passou de 3 s) |
| **▶▶❙** | Próxima música |
| **❙◀◀ / ▶▶❙** (segurar) | Retrocesso / avanço rápido com aceleração |

Sem interação, o modo de Tocando Agora volta a "Volume" após 5 segundos — como no aparelho original.

### Teclado (no computador)

`↑` `↓` rolar · `Shift+↑/↓` rolar rápido · `Enter` centro · `Esc` menu · `Espaço` play/pause · `←` `→` faixa anterior/próxima · roda do mouse rola a lista.

---

## 4. Arquitetura

```
index.html                 estrutura do aparelho (tela + click wheel)
css/ipod.css               visual; a tela é desenhada em 320x240 e escalada
manifest.webmanifest       instalação como app
sw.js                      service worker (app shell offline)
icons/                     ícones gerados programaticamente

js/
  app.js        inicialização, escala da tela, importação, barra de status
  nav.js        pilha de telas, árvore de menus, roteamento dos botões
  wheel.js      motor de gestos do Click Wheel (giro, toque, toque longo)
  audio.js      fila, shuffle, repeat, scrubbing, Media Session, persistência
  library.js    importação de arquivos e índices (artistas, álbuns, gêneros…)
  tags.js       leitor de metadados: ID3v1/v2.2/2.3/2.4, MP4/M4A, FLAC
  db.js         camada IndexedDB (faixas, arquivos, capas, playlists, ajustes)
  click.js      clicker do wheel, sintetizado via Web Audio (sem arquivos)
  settings.js   preferências persistidas
  util.js       formatação e helpers de DOM
  ui/list.js        menus em split view, com renderização por janela deslizante
  ui/nowplaying.js  tela Tocando Agora
  ui/coverflow.js   Cover Flow em 3D
  ui/extras.js      Relógio, Cronômetro, Sobre, Busca, progresso da importação
```

### Decisões de projeto

**Tela em coordenadas fixas.** Todo o conteúdo é desenhado num plano de 320×240 px — a resolução real do iPod Classic — e escalado por `transform`. Isso preserva as proporções tipográficas do original em qualquer aparelho e elimina divergência de layout entre telas.

**Sem dependências.** Nenhum `npm install`, nenhum bundler, nenhum CDN. O parser de tags e o clicker foram escritos do zero. Consequências: superfície de ataque mínima, funcionamento offline garantido e nenhum risco de cadeia de suprimentos.

**Listas com janela deslizante.** Somente as linhas visíveis vão para o DOM, então uma biblioteca de dezenas de milhares de músicas rola sem perda de fluidez.

**Dados locais por princípio.** Não há backend, conta, telemetria ou qualquer requisição de rede após o carregamento. Os arquivos de áudio ficam em IndexedDB e são tocados via `blob:` URL.

---

## 5. Limitações conhecidas (leia antes de usar)

### 5.1 Músicas protegidas por DRM não podem ser importadas

Músicas do **Apple Music** (streaming) e compras antigas da iTunes Store protegidas por **FairPlay** são criptografadas e não podem ser lidas por nenhum aplicativo que não seja o app Música da Apple. Isso não é uma limitação deste projeto: é uma proteção do sistema, e contorná-la não é opção.

**O que funciona:** arquivos desprotegidos que você tenha — MP3 de compras, rips próprios, downloads de Bandcamp, arquivos vindos do computador. Coloque-os no app **Arquivos** ou no **iCloud Drive** e importe.

### 5.2 Reprodução em segundo plano no iOS é limitada

O iOS restringe áudio em segundo plano para aplicativos web. Em geral:

- a música **continua** ao trocar de app por alguns instantes;
- ao **bloquear a tela**, o Safari pode suspender a reprodução;
- os controles da tela de bloqueio (Media Session) são registrados, mas o suporte varia por versão do iOS.

Um aplicativo nativo (Swift) não teria essa restrição. Se reprodução contínua com a tela bloqueada for requisito, essa é a única saída técnica — e está fora do escopo deste projeto.

### 5.3 O iOS pode apagar dados de sites pouco usados

O Safari remove dados de sites (incluindo IndexedDB) após **7 dias sem uso**. Duas mitigações já implementadas:

1. o app chama `navigator.storage.persist()` após a primeira importação;
2. **instalar na Tela de Início** tira o app dessa política de expiração.

Mesmo assim: **mantenha os arquivos originais**. A biblioteca do app é uma cópia de trabalho, não um backup.

### 5.4 Espaço em disco

O quota do Safari para um site é de alguns GB e varia com o espaço livre do aparelho. **Ajustes → Sobre** mostra o uso atual e o quota reportado pelo navegador.

### 5.5 Não implementado

Fotos, vídeos, jogos, notas, rádio, sincronização com iTunes e equalizador não foram implementados. Playlists têm criação via "Lista Rápida" (segurar o botão central sobre uma música); não há editor completo de playlists.

---

## 6. Publicação

O Service Worker e a instalação como app exigem **HTTPS** (ou `localhost`).

### GitHub Pages

```
Settings → Pages → Source: Deploy from a branch
Branch: main  /  (root)
```

O app fica em `https://<usuario>.github.io/<repositorio>/`. Todos os caminhos são relativos, então funciona em subdiretório sem ajuste.

### Servidor local (desenvolvimento)

```bash
python3 -m http.server 8777
# abra http://localhost:8777
```

---

## 7. Testes

O projeto inclui dois níveis de verificação, executados durante o desenvolvimento:

- **Parser de metadados** — arquivos MP3 (ID3v2.3 + APIC, ID3v1, sem tag), M4A e FLAC sintetizados, conferindo título, artista, álbum, artista do álbum, gênero numérico, faixa, disco, ano, compositor e capa. Todos os casos passam.
- **Ponta a ponta no navegador** (Chromium via Playwright, viewport de iPhone) — importação de 5 arquivos, navegação pelos menus com gestos reais de giro no aro, reprodução de um WAV real, play/pause, volume pela roda, scrubbing, troca de faixa, Cover Flow, Ajustes e persistência após recarregar a página. Sem erros de console.

---

## 8. Próximos passos sugeridos

| Prioridade | Item | Motivo |
|---|---|---|
| Alta | Editor de playlists completo | Única funcionalidade central do iPod ainda parcial |
| Alta | Importar pasta inteira (`webkitdirectory`) | Reduz o atrito de montar a biblioteca no desktop |
| Média | Equalizador (Web Audio `BiquadFilter`) | Presente no original; baixo custo de implementação |
| Média | Exportar/importar a biblioteca | Mitiga o risco de perda descrito em 5.3 |
| Baixa | Jogos dos Extras (Brick) | Fidelidade ao original |
| Avaliar | Versão nativa (Swift/SwiftUI) | Único caminho para áudio em segundo plano sem restrição (5.2) |
