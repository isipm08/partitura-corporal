# Partitura corporal

Ejercicio 02 del curso DPPI 2026, sobre visión artificial, cuerpo, movimiento y representación. La propuesta utiliza una sola cámara para construir dos maneras distintas de percibir el mismo gesto y convertirlo en una experiencia sonora y visual.

## De qué se trata

MediaPipe y OpenCV.js funcionan al mismo tiempo con la misma cámara. La imagen real no se muestra directamente: cada sistema selecciona el dato que le interesa y lo representa de una manera diferente.

La página presenta cuatro zonas de interacción. Una línea luminosa indica hacia qué zona debe moverse la persona. Cuando una palma ocupa la posición correspondiente, la canción aumenta de volumen. La energía del movimiento modifica el brillo y la intensidad de esa activación.

Guitar Hero fue solamente una referencia inicial para pensar elementos visuales sincronizados con música. El resultado no busca copiar ese videojuego: no tiene puntajes, combos, mensajes de error, mástil de guitarra ni una lógica competitiva. La propuesta funciona como una instalación audiovisual en la que el cuerpo modifica la canción.

**Sistema A — MediaPipe: reconocimiento corporal.** Usa MediaPipe Hand Landmarker para identificar los 21 puntos anatómicos de hasta dos manos. A partir de la muñeca y los nudillos, JavaScript calcula el centro de cada palma y determina si está en la zona morada, verde, azul o naranja. Ambas manos se dibujan de la misma manera y cualquiera puede activar un evento. El seguimiento incluye suavizado y validación para reducir temblores, falsas detecciones y pérdidas durante movimientos rápidos.

**Sistema B — OpenCV.js: percepción del movimiento.** No reconoce manos, personas ni objetos. Compara cada fotograma con el anterior y mide cuánto cambió el brillo de la imagen. Para mantener la fluidez, procesa una copia reducida de 160 × 90 píxeles. Esa medida de movimiento modifica la intensidad visual, el brillo y cuánto aumenta el volumen de la canción.

JavaScript conecta ambas lecturas: MediaPipe indica **dónde está el cuerpo** y OpenCV señala **cuánta energía existe en la imagen**.

## Cómo funciona la interacción

1. Abrir la página desde su enlace público.
2. Presionar **Activar cámara**.
3. Autorizar el permiso de cámara en el navegador.
4. Elegir una canción.
5. Mover una o dos manos hacia las zonas indicadas por el recorrido.

El recorrido tarda 1,8 segundos en llegar a la línea de activación y los cambios pueden ocurrir cada 0,75 segundos. Sus segmentos permanecen conectados y fluyen continuamente entre una zona y la siguiente.

La posición correcta de la palma activa el evento. OpenCV modula su intensidad, pero un movimiento suave no bloquea la activación.

## Sonido y canciones

La canción seleccionada se reproduce completa y continuamente. Cuando no existe una activación, permanece como una guía sonora de volumen bajo. Al colocar una mano en la zona correcta, el volumen aumenta suavemente según la energía del movimiento.

La versión actual incluye:

- Do For Love
- Beat It
- Never Say Never
- Back in Black

Cada canción conserva su velocidad original y utiliza un mapa JSON independiente. `audio.currentTime` funciona como reloj maestro para mantener sincronizados el sonido y el recorrido visual.

Los archivos MP3 tienen mezclas diferentes, por lo que cada uno posee un volumen de fondo y un rango activo propios. Como son grabaciones completas, para controlar solamente una guitarra u otro instrumento sería necesario trabajar con pistas separadas o *stems* autorizados.


## Diseño

La página utiliza una estética retro de blanco y negro, tipografía pixelada y botones curvos que invierten sus colores al presionarlos. Morado, verde, azul y naranja aparecen solamente dentro de las visualizaciones para diferenciar las cuatro zonas.

Dos animaciones GIF acompañan el recorrido de la página. El gato pixelado se repite en la parte superior y aparece nuevamente debajo de las ventanas. Una animación de símbolos musicales funciona como transición entre la introducción y la experiencia. Ambas conservan sus colores originales, proporciones y bordes redondeados.

La reflexión semiótica aparece al final, después de la interacción.

## Reflexión

Frente a la cámara ocurre un solo gesto, pero cada sistema encuentra algo diferente. MediaPipe reconoce una estructura corporal y organiza la mano mediante puntos y relaciones. OpenCV no comprende qué está mirando: solamente registra diferencias entre una imagen y la siguiente.

La comparación demuestra que una cámara no produce una sola interpretación de la realidad. El resultado depende de las reglas con las que cada sistema fue construido: uno busca una anatomía reconocible y el otro busca diferencias entre píxeles.

Los puntos anatómicos, las zonas de color y la intensidad del movimiento representan aspectos de una persona, pero no pueden mostrarla por completo. Cada sistema selecciona cierta información y deja otra fuera.

Estas imágenes funcionan como huellas del gesto y, al mismo tiempo, como símbolos construidos por la interfaz. La relación entre posición, movimiento, color y sonido no es natural: es una decisión del proyecto.

> ¿Qué queda del cuerpo cuando una máquina lo transforma en posición, movimiento, luz y sonido?

## Cómo probarlo durante el desarrollo

El proyecto utiliza módulos JavaScript y archivos JSON, por lo que `index.html` no debe abrirse directamente mediante `file://`.

Desde Visual Studio Code:

1. Abrir la carpeta descargada del proyecto.
2. Abrir `index.html`.
3. Ejecutar **Open with Live Server** o **Go Live**.
4. Entrar a la dirección local indicada por Live Server.
5. Autorizar la cámara y presionar **Activar cámara**.

La versión pública deberá utilizar HTTPS para que cualquier persona pueda autorizar su cámara desde el navegador.

## Archivos principales

- `index.html`: estructura de la interfaz y contenido visible.
- `style.css`: composición, tipografía, colores y adaptación de pantalla.
- `script.js`: cámara, MediaPipe, OpenCV, audio y sincronización.
- `README.md`: explicación del proyecto y forma de ejecución.
- `assets/images/`: animaciones GIF.
- `assets/music/`: canciones utilizadas en la prueba.
- `songs/`: mapas JSON de los recorridos.
- `vendor/`: archivos locales de MediaPipe y OpenCV.js.

## Tecnologías

MediaPipe Hand Landmarker, OpenCV.js, Canvas 2D, HTML, CSS y JavaScript puro, sin frameworks ni proceso de compilación.

MediaPipe y OpenCV.js se cargan explícitamente desde `vendor/`. El modelo de Hand Landmarker y la tipografía `Press Start 2P` se solicitan por Internet al iniciar la página.

---

Partitura corporal · Ejercicio 02 · DPPI 2026


readme.md 

archivo java

archivo css
