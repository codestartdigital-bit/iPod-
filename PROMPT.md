# Prompt — Tocador de MP3 estilo iPod Classic

Copie tudo abaixo da linha e cole na ferramenta.

---

Construa um **aplicativo web instalável (PWA) que replica o iPod Classic de 6ª geração**: interface, navegação e comportamento dos botões. Ele roda em tela cheia no iPhone, adicionado à Tela de Início pelo Safari, e toca arquivos de música que o usuário importa do próprio aparelho.

Publique o resultado num endereço HTTPS acessível e me devolva a URL.

## Regras técnicas obrigatórias

- **Sem dependências externas.** HTML, CSS e JavaScript puro (ES modules). Nenhum framework, nenhum bundler, nenhum CDN, nenhum `npm install`. Tudo precisa funcionar offline depois do primeiro carregamento.
- **Sem backend.** Nenhuma conta, nenhum servidor, nenhuma telemetria, nenhuma requisição de rede após o carregamento. Os arquivos de áudio ficam no aparelho.
- **Armazenamento em IndexedDB**, com object stores separados para: faixas (metadados), arquivos de áudio (Blob), capas de álbum (deduplicadas por álbum), playlists e preferências.
- Reprodução via elemento `<audio>` com `blob:` URL criada sob demanda e revogada ao trocar de faixa.
- Registre um **Service Worker** com cache-first do app shell.
- Inclua `manifest.webmanifest` com `display: standalone`, `orientation: portrait`, e `apple-touch-icon` de 180×180.
- Chame `navigator.storage.persist()` após a primeira importação.
- Use `viewport-fit=cover` e as `env(safe-area-inset-*)` para respeitar o notch.

## Layout do aparelho

O corpo do iPod ocupa **toda a viewport** (sem margens brancas), com acabamento de alumínio grafite escovado. De cima para baixo: moldura preta com a tela, e abaixo o Click Wheel circular centralizado.

**Ponto crítico da fidelidade visual:** desenhe todo o conteúdo da tela num sistema de coordenadas fixo de **320×240 px** (a resolução real do iPod Classic) e escale por `transform: scale()`, calculando o fator em JavaScript a partir do espaço disponível. Isso preserva as proporções tipográficas do original em qualquer aparelho. Não use unidades relativas dentro da tela.

Proporções: a tela ocupa até 50% da altura útil; o Click Wheel tem diâmetro de cerca de 72% da largura, centralizado no espaço restante.

## Aparência da tela (iPod Classic 6G)

- **Barra de status** de 22 px: degrade cinza-escuro brilhante, texto branco em negrito de 12 px com sombra, ícone de play/pause à esquerda, relógio e bateria à direita.
- **Menus em split view**: lista à esquerda ocupando 55% da largura, painel de preview à direita com a capa do item selecionado (96×96 px, com reflexo espelhado embaixo), título e subtítulo centralizados.
- **Linhas da lista**: 25 px de altura, fonte Helvetica de 14 px, fundo branco, separador cinza claro, chevron à direita nos itens que abrem submenu.
- **Barra de seleção**: degrade azul brilhante (claro no topo, escuro embaixo, com a quebra nítida no meio), texto branco com sombra.
- Renderize a lista com **janela deslizante** — só as linhas visíveis vão para o DOM, para suportar bibliotecas de dezenas de milhares de músicas sem travar.

## Click Wheel — comportamento

Implemente o giro por **ângulo real do ponteiro** em relação ao centro da roda (não por deslocamento vertical):

| Gesto | Ação |
|---|---|
| Girar o aro | Rola a lista. A cada 14° emite um passo, com aceleração: giros rápidos avançam até 4 linhas por passo |
| Girar em "Tocando Agora" | Volume |
| **Centro** | Selecionar / tocar |
| **Centro** em "Tocando Agora" | Alterna entre três modos: Volume → Avançar/Retroceder → Avaliação (estrelas). Sem interação, volta a Volume após 5 s |
| **Centro** (segurar) sobre uma música | Abre menu de ações da faixa: "Adicionar à Lista Rápida" e "Apagar Música" |
| **MENU** | Voltar uma tela |
| **MENU** (segurar) | Volta direto ao menu principal |
| **▶❙❙** | Tocar / pausar |
| **▶❙❙** (segurar) | Apaga a tela (dorme) |
| **❙◀◀** | Música anterior; se já passou de 3 s, reinicia a atual |
| **▶▶❙** | Próxima música |
| **❙◀◀ / ▶▶❙** (segurar) | Retrocesso / avanço rápido com aceleração progressiva |

Regras do gesto: se o dedo descer sobre um botão e depois girar mais que 10°, o toque no botão é cancelado e vira rolagem. O botão central nunca gira. Toque longo é a partir de 550 ms.

Adicione suporte a teclado no desktop: setas para rolar, Enter para centro, Esc para menu, Espaço para play/pause, setas laterais para trocar de faixa, e a roda do mouse para rolar.

**Clicker:** sintetize o estalo da roda com a Web Audio API (rajada curta de ruído com decaimento exponencial, ~12 ms), sem usar arquivo de áudio. Desbloqueie o contexto de áudio no primeiro toque do usuário (exigência do iOS). Deve ser desligável nos Ajustes.

**Luz de fundo:** após N segundos sem interação (configurável: 10 s, 30 s, 1 min, sempre ligada), escurece a tela. O primeiro toque apenas acende, sem executar a ação.

## Árvore de menus

```
iPod (menu principal)
├── Música
│   ├── Cover Flow          capas em 3D percorridas pela roda; centro abre o álbum
│   ├── Playlists           + "Adicionadas recentemente" e "Mais tocadas"
│   ├── Artistas            → álbuns do artista (+ "Todas as músicas") → faixas
│   ├── Álbuns              → faixas, numeradas pela ordem do disco
│   ├── Músicas             todas, ordenadas por título
│   ├── Gêneros             → faixas
│   ├── Compositores        → faixas
│   └── Buscar              teclado alfabético girado pela roda, com resultados
├── Extras
│   ├── Relógio
│   ├── Cronômetro
│   └── Sobre               contagens, duração total, uso de disco
├── Ajustes
│   ├── Adicionar Músicas   abre o seletor de arquivos
│   ├── Aleatório           Desligado / Músicas
│   ├── Repetir             Desligado / Uma / Todas
│   ├── Clicker             Ligado / Desligado
│   ├── Luz de fundo        10 s / 30 s / 1 min / Sempre ligada
│   ├── Acabamento          Grafite / Prata
│   ├── Sobre
│   ├── Restaurar ajustes   com confirmação
│   └── Apagar biblioteca   com confirmação
├── Aleatório               toca tudo em ordem aleatória
└── Tocando Agora           aparece só quando há música carregada
```

Tela **Tocando Agora**: capa de 120×120 à esquerda; à direita o índice ("3 de 12"), título, artista e álbum com o ano; embaixo, tempo decorrido à esquerda, tempo restante negativo à direita, barra de progresso azul, e uma linha com o modo ativo (volume, scrub ou estrelas).

## Importação de músicas

Botão "Adicionar Músicas" abre um `<input type="file" multiple accept="audio/*">`. **A chamada `input.click()` precisa ser síncrona dentro do manipulador do gesto do usuário**, senão o iOS bloqueia o seletor. No desktop, aceite também arrastar e soltar.

Escreva um **leitor de metadados próprio**, sem biblioteca externa, cobrindo:

- **ID3v2.2, v2.3 e v2.4** (MP3): quadros de texto TIT2/TPE1/TPE2/TALB/TCON/TCOM/TRCK/TPOS/TYER/TDRC e equivalentes de 3 letras da v2.2. Trate os quatro encodings (ISO-8859-1, UTF-16 com BOM, UTF-16BE, UTF-8), o cabeçalho estendido, o indicador de tamanho e a *unsynchronisation* da v2.4. Extraia a capa do quadro APIC (e PIC na v2.2).
- **ID3v1/v1.1** como fallback nos últimos 128 bytes.
- **MP4/M4A/M4B**: percorra os átomos até `moov > udta > meta > ilst`, lendo `©nam`, `©ART`, `aART`, `©alb`, `©gen`, `gnre`, `©wrt`, `©day`, `trkn`, `disk` e a capa em `covr`. Trate tamanho de átomo de 64 bits.
- **FLAC**: blocos VORBIS_COMMENT e PICTURE.
- Gênero numérico: converta `(17)` ou `17` pela tabela padrão do ID3v1.
- Sem tag alguma: deduza pelo nome do arquivo no padrão `01 - Artista - Título.mp3`.

Leia os metadados por fatias do arquivo (`Blob.slice`), nunca carregando o arquivo inteiro na memória.

**Duração:** não tente calcular pelo container. Carregue o blob num elemento `<audio>` e leia `duration` no evento `loadedmetadata`, com timeout de 8 s.

**Deduplicação:** gere o id da faixa por hash de nome + tamanho + data de modificação, e ignore arquivos já importados.

Mostre uma tela de progresso durante a importação e, ao final, um resumo: quantas adicionadas, quantas já existiam, quantas falharam e quantas estão em formato que o navegador não decodifica.

## Reprodução

- Fila com shuffle (Fisher-Yates, mantendo a faixa escolhida em primeiro lugar) e repeat (desligado / uma / todas).
- No fim da fila sem repeat, pare — como o aparelho original.
- **Arquivo corrompido ou não suportado: pule automaticamente**, com um contador que impede laço infinito caso a fila inteira seja inválida.
- Registre a **Media Session API** (metadados e handlers de play, pause, faixa anterior/próxima, seek) para os controles da tela de bloqueio.
- Persista fila, posição e tempo decorrido, restaurando no próximo acesso sem tocar automaticamente.
- Ao apagar uma faixa que está tocando, pare a reprodução, libere a `blob:` URL e esvazie a tela "Tocando Agora"; se não for a atual, reconstrua a fila preservando a música em execução.

## Ícone

Silhueta de **maçã com mordida à direita e folha inclinada**, em branco-prateado, com uma **nota musical (duas cabeças unidas por barra) vazada no centro**, sobre fundo grafite com cantos arredondados. Gere nos tamanhos 180, 192 e 512 px, mais uma variante *maskable* de 512 px.

## Limitações que você deve respeitar e declarar

1. **Músicas com DRM (Apple Music e compras antigas da iTunes Store com FairPlay) não podem ser importadas** — são criptografadas pelo sistema. Não tente contornar. Deixe isso claro na documentação e aceite apenas arquivos desprotegidos (MP3, M4A/AAC sem DRM, WAV, FLAC).
2. **Áudio em segundo plano no iOS é limitado** para aplicativos web: ao bloquear a tela o Safari pode suspender a reprodução. Registre a Media Session mesmo assim, mas não prometa o que a plataforma não entrega.
3. **O Safari apaga dados de sites após 7 dias sem uso.** Mitigue com `navigator.storage.persist()` e avise que instalar na Tela de Início tira o app dessa política. Deixe explícito que a biblioteca do app é cópia de trabalho, não backup.
4. Se a página for servida dentro de um iframe, o `apple-touch-icon` não é lido pelo Safari ao adicionar à Tela de Início. **A página precisa ser de primeiro nível, em domínio próprio.**

## Critérios de aceite

Entregue funcionando e verificado:

- [ ] Importar 5 arquivos de formatos diferentes e ver título, artista, álbum e capa corretos
- [ ] Girar o aro rola a lista com aceleração; o clicker soa
- [ ] Tocar uma música: barra de progresso anda, tempo restante conta para trás
- [ ] Play/pause, faixa anterior e próxima funcionam pelos botões da roda
- [ ] Girar em "Tocando Agora" muda o volume; o centro alterna para scrub e o giro navega no tempo
- [ ] Cover Flow percorre as capas em 3D
- [ ] Segurar o centro sobre uma música abre as ações e a exclusão individual funciona com confirmação
- [ ] Recarregar a página mantém a biblioteca e a posição da fila
- [ ] Nenhum erro no console
- [ ] Adicionar à Tela de Início abre em tela cheia, sem barra do Safari, com o ícone da maçã

Responda com a URL HTTPS de primeiro nível onde o app está publicado.
