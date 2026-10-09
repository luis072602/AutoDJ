# AutoDJ · versión YouTube (para el PC)

La versión principal, que funciona en cualquier dispositivo con música de Audius, está en la raíz del repositorio.
Esta es la que mezcla listas de YouTube; todo lo que sigue se hace dentro de esta carpeta `youtube/`.

DJ automático en el navegador: detecta BPM, compases, intro y final de cada canción, y las mezcla alineando los golpes.
Las canciones pueden venir de **tus archivos** o de **YouTube / YouTube Music**. En los dos casos el audio pasa por el
mismo motor: mezcla por BPM, filtros de cruce y **ecualizador**. No se muestra ningún video.

Uso personal: descargar audio de YouTube va contra sus condiciones de servicio, así que esto no sirve para publicar ni comercializar.

## Ejecutar

Requisitos (una sola vez): Python 3 y `yt-dlp`.

    py -m pip install yt-dlp

Después, doble clic en **`iniciar.bat`**, o desde una terminal en esta carpeta:

    py server.py

y abre http://localhost:8080. No sirve abrir `index.html` con doble clic ni con `python -m http.server`:
sin `server.py` la app solo puede mezclar archivos (arriba a la derecha lo indica).

## Usar

- **Conectar mi cuenta**: inicia sesión con Google (permiso de solo lectura), elige una lista y pulsa **Cargar lista**.
- **Cargar enlace**: pega el enlace de una lista o canción pública; se suma a la lista, sin iniciar sesión.
- **+ Archivos** o arrastrar: agrega audio local. Si su nombre coincide con una canción de la lista de YouTube, se usa el archivo en vez de descargarla.
- **Reproducir** y listo: mezcla sola. **Mezclar ya** fuerza el cruce; clic en una canción mezcla hacia ella; clic en la onda salta a ese punto. Barra espaciadora = pausa.
- **Analizar todo** mide el BPM de toda la lista (descarga cada canción) para que **Ordenar para el ambiente** pueda ordenarla. Sin eso, cada canción se analiza al acercarse su turno.

## Desde el celular

**En casa, con todo (YouTube incluido):** en el PC abre `iniciar-red.bat` (o `py server.py --red`). La ventana muestra una
dirección como `http://192.168.1.20:8080`; ábrela en el celular conectado a la misma Wi-Fi. La primera vez Windows pregunta
si permite el acceso a la red: acepta en redes privadas. El PC descarga el audio y el celular lo mezcla y lo reproduce.
En ese modo no funciona «Conectar mi cuenta» (Google solo acepta el login desde `localhost` o desde un sitio https);
usa **Cargar enlace** con el enlace de tu lista (tiene que ser pública o «no listada»).

**Desde cualquier lugar (GitHub Pages):** la página publicada funciona sola, pero solo con archivos de audio del propio
aparato: GitHub aloja páginas, no puede ejecutar `server.py`, así que ahí no hay audio de YouTube.

## Ecualizador

5 bandas (60 Hz, 230 Hz, 910 Hz, 3,6 kHz, 14 kHz), de -12 a +12 dB, con ajustes rápidos y analizador de espectro.
Actúa sobre todo lo que suena. Doble clic en una banda la devuelve a 0. El ajuste se guarda en el navegador.
Un limitador evita que subir graves sature.

## Estructura

    index.html        estructura de la página
    css/styles.css    diseño
    js/main.js        arranque
    js/state.js       estado compartido y utilidades
    js/audio.js       salida de audio: master, ecualizador, limitador, analizador
    js/analyze.js     análisis de cada canción (BPM, compás, intro, final)
    js/library.js     lista: carga del audio, memoria, orden, emparejar archivos
    js/mixer.js       decks, plan de cruce y piloto automático
    js/eq.js          panel del ecualizador y espectro
    js/ui.js          consola y lista
    js/youtube.js     login de Google, listas y enlaces
    js/config.js      Client ID de Google
    server.py         servidor local: sirve la app y entrega el audio de YouTube
    cache/            audio ya descargado (se limpia solo al pasar de 3 GB; se puede borrar)
    index-anterior.html   la versión anterior, de un solo archivo

## Client ID de Google

Ya viene puesto en `js/config.js` (se puede cambiar en la app, en «Client ID de Google»). Para crear otro:
en https://console.cloud.google.com crea un proyecto, habilita **YouTube Data API v3**, configura la pantalla de consentimiento
(tipo Externo, agrégate como usuario de prueba) y crea un **ID de cliente de OAuth** de tipo Aplicación web con
`http://localhost:8080` en «Orígenes autorizados de JavaScript».

## Límites

- El login de Google solo funciona desde el origen autorizado (`http://localhost:8080`) y, mientras el proyecto esté en modo Prueba, con los usuarios de prueba.
- YouTube a veces se niega a entregar una canción (control anti-bots, videos privados o bloqueados). La app la marca, la salta y sigue; un clic sobre ella reintenta.
- La primera vez que suena una canción de YouTube hay que descargarla (unos segundos). La app adelanta las dos siguientes mientras suena la actual.
- Si YouTube cambia algo y dejan de bajar las canciones, actualiza: `py -m pip install -U yt-dlp`.
