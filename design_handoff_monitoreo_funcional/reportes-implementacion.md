# Reportes — guía de implementación

Fuente de verdad: `pantallas/Reportes v2.dc.html` (1920×1080). Tokens heredados de `discrepancias-implementacion.md`.

## El cambio importante

La pantalla original era un formulario de una línea sobre 900px de vacío: el usuario elegía fechas y pulsaba CSV sin saber qué iba a recibir. Aquí es un **armador en tres pasos**, todo visible a la vez:

1. **Qué reporte** — 4 tarjetas seleccionables (Incidentes · Reporte SLA · Discrepancias DAC · OCR de placas), cada una con una línea que explica para qué sirve.
2. **Qué período y filtros** — presets de fecha, chips de estación multi-selección, y toggles propios del reporte elegido.
3. **Qué vas a descargar** — filas estimadas, número de columnas, tamaño aproximado, la lista completa de columnas, y un aviso específico del informe. Recién debajo, los botones CSV y PDF.

Abajo, **Descargas recientes**: los informes ya generados se vuelven a bajar sin regenerar (30 días de retención).

## Reglas

- **Las columnas del CSV se muestran antes de descargar.** Es la información que evita la descarga-prueba-error.
- **La estimación de filas reacciona a los filtros** (período y estaciones). Si el backend no puede estimar barato, un `HEAD`/`count` cacheado por combinación de filtros es suficiente.
- **Cada informe lleva su propio aviso**, y no es decorativo: agrupar ráfagas baja Incidentes de 2,026 a 615 filas; excluir mantenimiento sube el uptime de 97.00% a 98.4%; OCR con 7,907 filas no tiene sentido en PDF. Son las decisiones que el usuario tomaría mal sin ayuda.
- **PDF y CSV no son equivalentes**: PDF sirve hasta ~500 filas; por encima, ofrecer solo CSV o advertir.
- `Todas` en estaciones es el estado por defecto y se apaga al marcar cualquier estación concreta.

## Endpoints

`GET /reportes/tipos` · `/reportes/estimar?tipo=&desde=&hasta=&estaciones=&opciones=` (devuelve filas, columnas, bytes) · `POST /reportes/generar` (devuelve job id) · `GET /reportes/recientes` · `GET /reportes/descargar/{id}`

## Pendiente sugerido (no implementado)

Programar envío recurrente por correo (semanal/mensual) reusando la misma configuración de los tres pasos. Es el complemento natural de "Descargas recientes", pero no estaba en el alcance original — confirmar antes de construirlo.
