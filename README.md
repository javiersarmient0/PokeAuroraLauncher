<p align="center">
  <img src="app/assets/images/SealCircle.png" alt="PokeAurora" width="96">
</p>

<h1 align="center">PokeAurora Launcher</h1>

<p align="center">
  Launcher oficial de PokeAurora basado en Helios Launcher.
</p>

## Características

* ✨ **Interfaz PokeAurora**
  - Diseño clean inspirado en la aurora y adaptado al fondo oficial.
  - Logo unificado en el launcher, ejecutables y ventanas del sistema.
  - Sonidos sutiles al pasar por encima y pulsar los controles.

* ☕ **Validación automática de Java**
  - Si tienes instalada una versión incompatible de Java, instalaremos la correcta por ti.
  - No necesitas tener Java instalado para utilizar el launcher.

* 🔒 **Gestión completa de cuentas**
  - Añade múltiples cuentas y cambia entre ellas fácilmente.
  - Compatibilidad con cuentas Microsoft.
  - Compatibilidad con cuentas Offline (No Premium).
  - Los tokens se cifran localmente con el almacén seguro del sistema operativo.
  - Las credenciales nunca se envían a servidores de PokeAurora.

* 📂 **Instalación y reparación inteligente**
  - La versión del launcher permanece fijada en `1.0.0` hasta que el proyecto decida actualizarla.
  - Los archivos se validan antes de iniciar el juego.
  - Los archivos sin cambios usan una caché de integridad y los mods desactivados no se descargan.
  - Las descargas muestran tamaño, velocidad y tiempo restante.

* ⚙️ **Configuración avanzada**
  - Ajusta la memoria RAM asignada.
  - Selecciona la versión de Java utilizada por el launcher.

* 🎮 **Conexión directa a Poke Aurora**
  * Instala todo lo necesario con un solo clic.
  * Sincroniza el FancyMenu oficial y `servers.dat` antes de abrir Minecraft.
  * Comienza tu aventura sin configuraciones complicadas.

## Desarrollo

Se requiere Node.js 22. Antes de generar una compilación, ejecuta:

```bash
npm ci
npm run verify
```

El índice remoto está limitado al host oficial y fijado mediante SHA-256. Cualquier cambio intencional en la distribución debe revisarse y actualizar su huella en `distributionsanitizer.js`.

El paquete oficial de FancyMenu también está fijado mediante SHA-256 en `gameconfigsync.js`. Si se reemplaza deliberadamente el ZIP, debe actualizarse esa huella después de revisar su contenido.
