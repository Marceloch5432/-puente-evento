# Puente: servidor desde el navegador

Este paquete complementa el HTML de Tiiny. No exige instalar Node.js en tu computadora: Cloudflare ejecuta las herramientas de publicación. Necesitas cuentas de GitHub y Cloudflare y una clave nueva de OpenAI con acceso y facturación para la API. El uso de los servicios puede generar costes.

## 1. Sube estos archivos a GitHub

Extrae el ZIP y abre https://github.com/new . Crea un repositorio privado llamado `puente-evento`. En su página, elige la opción para subir archivos (uploading an existing file o Add file > Upload files). Arrastra el CONTENIDO de la carpeta extraída y guarda los cambios con Commit changes. Los archivos `wrangler.jsonc`, `worker.mjs` y `package.json` deben verse directamente en la raíz del repositorio; no subas el ZIP como un único archivo.

Este paquete no contiene credenciales reales. No añadas tu clave de OpenAI al repositorio.

## 2. Conecta Cloudflare

En https://dash.cloudflare.com/ abre Workers & Pages > Create application > Import a repository. Autoriza GitHub para acceder al repositorio `puente-evento` y selecciónalo.

Configuración:
- Nombre del Worker: `puente-evento` (debe coincidir con `name` en wrangler.jsonc).
- Rama de producción: la principal de tu repositorio, normalmente `main`.
- Root directory: la raíz del repositorio; deja el valor predeterminado.
- Build command: vacío; el servidor no requiere una compilación previa.
- Deploy command: `npx wrangler deploy`.

Pulsa Save and Deploy. Los comandos se ejecutan en Cloudflare, no en tu computadora. La configuración incluida crea automáticamente el recurso de la sala compartida. Si falla, conserva el mensaje de error sin incluir claves y pide ayuda. Si ya existe un Worker tuyo llamado `puente-evento`, usa otro nombre y cambia también `name` en wrangler.jsonc antes de publicar.

## 3. Añade tres secretos al Worker

Cuando termine el primer despliegue, abre el Worker > Settings > Variables and Secrets > Add. Añade estos TRES valores como tipo Secret, y guarda/publica los cambios:

| Nombre exacto | Valor |
| --- | --- |
| APP_ORIGINS | El origen HTTPS de tu sitio Tiiny, por ejemplo https://mi-evento.tiiny.site, sin barra final ni ruta. |
| ROOM_ACCESS_TOKEN | Un código aleatorio que generarás con SIN_INSTALAR.html. |
| OPENAI_API_KEY | Tu clave NUEVA de OpenAI. Nunca la pegues en GitHub, en el HTML o en el chat. |

Usa los secretos de ejecución del Worker, NO la sección de variables del proceso de Builds. Este archivo wrangler.jsonc no incluye vars para estos nombres; los secretos se conservan al volver a desplegar. Revoca la clave de OpenAI que compartiste antes en el chat.

## 4. Conecta la página de Tiiny

Copia la dirección pública del Worker que termina en workers.dev. En tu página de Tiiny, pulsa el icono de configuración. Introduce esa dirección HTTPS y el mismo código ROOM_ACCESS_TOKEN. Pulsa Guardar y conectar. Debe aparecer Sala conectada. Usa el botón de compartir para obtener el enlace completo y el único QR para el celular y la laptop.

Para facilitarlo, SIN_INSTALAR.html permite generar el código y construir el enlace completo. Abre ese archivo en tu navegador desde la carpeta extraída. No necesita subirse a Tiiny y nunca solicita la clave de OpenAI.

En el celular, elige Hablar > Probar conexión sin micrófono; en la laptop, Ver traducción. Si ambos reciben las frases de ejemplo, detén esa prueba e inicia una prueba de voz real. La demo compartida no llama a OpenAI.

## Estado

El código del servidor es el mismo que superó la prueba de cuatro conexiones WebSocket locales. Este paquete se comprueba mediante un empaquetado local sin desplegarlo. El proceso de publicación desde GitHub debe completarse en tus cuentas; no se ha ejecutado por ti. La traducción con audio real sigue pendiente de configurar y probar tus equipos. El navegador del entorno no permitió la validación visual de la guía; no se presenta como probada en un navegador real.

Mantén el teléfono desbloqueado y Chrome visible. La app no graba audio, pero lo envía a OpenAI para traducirlo. El servidor comparte subtítulos recientes; no archiva la conferencia. La exclusividad permite un micrófono a la vez, y cualquier invitado con el enlace puede tomarlo cuando esté libre.

## Referencias

- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
