# AutoDJ · Audius

DJ automático en el navegador: busca música en [Audius](https://audius.co), detecta BPM, compases, intro y final de cada
canción, y las mezcla alineando los golpes. Incluye ecualizador de 5 bandas.

Es una página estática: **no necesita servidor, cuenta ni clave**. Funciona igual en computador y celular, desde cualquier
sitio donde se publique (por ejemplo GitHub Pages).

## Usar

- **Música**: busca por canción o artista, toca un género para ver las tendencias de la semana, o pega un enlace de
  `audius.co` (canción o lista). Toca una canción para agregarla, o «Agregar todas».
- **Reproducir** y mezcla sola. **Mezclar ya** fuerza el cruce; tocar una canción de la lista mezcla hacia ella; tocar la
  onda salta a ese punto. Barra espaciadora = pausa.
- **Ordenar para el ambiente** usa el BPM que declara Audius, así que funciona sin descargar nada. **Analizar todo** mide
  cada canción por adelantado (BPM real, intro y final); si no, se analiza al acercarse su turno.
- **+ Archivos**: también mezcla audio propio del aparato.

Solo aparecen canciones que cualquiera puede oír completas y que duran entre 1 y 8 minutos (los sets largos no caben en memoria).

## Probar en el PC

Los módulos no cargan abriendo `index.html` con doble clic. En esta carpeta:

    py -m http.server 8080

y abre http://localhost:8080.

## Estructura

    index.html        estructura de la página
    css/styles.css    diseño
    js/main.js        arranque
    js/state.js       estado compartido y utilidades
    js/audio.js       salida de audio: master, ecualizador, limitador, analizador
    js/analyze.js     análisis de cada canción (BPM, compás, intro, final)
    js/library.js     lista: carga del audio, memoria, orden
    js/mixer.js       decks, plan de cruce y piloto automático
    js/eq.js          panel del ecualizador y espectro
    js/ui.js          consola y lista
    js/audius.js      búsqueda, tendencias y enlaces de Audius

## Límites

- El catálogo es el de Audius: artistas independientes y mucha electrónica, no música comercial.
- La primera vez que suena una canción hay que descargarla (unos segundos); la app adelanta las siguientes.
- En el celular hay que dejar la pantalla encendida y la pestaña abierta: los navegadores móviles frenan o cortan el audio de una página en segundo plano.
