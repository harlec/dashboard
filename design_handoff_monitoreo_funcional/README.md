# PulsoVial · Rediseño del monitoreo funcional

Paquete de entrega para implementación. Seis pantallas rediseñadas sobre un mismo lenguaje visual, cada una con su guía.

## Qué hay aquí

```
README.md                          ← este archivo (empieza acá)
sistema-visual.md                  ← tokens, retícula y componentes compartidos
noc-implementacion.md
discrepancias-implementacion.md
ocr-placas-implementacion.md
incidentes-implementacion.md
reporte-sla-implementacion.md
reportes-implementacion.md
pantallas/                         ← las plantillas, abren en cualquier navegador
  NOC - Estado en tiempo real v2.dc.html
  Discrepancias DAC v2.dc.html
  OCR Placas v2.dc.html
  Incidentes v2.dc.html
  Reporte SLA v2.dc.html
  Reportes v2.dc.html
  support.js                       ← runtime de las plantillas, no editar
```

Las plantillas son HTML autocontenido: abrí el archivo y se ve la pantalla a 1920×1080, con las pestañas y filtros funcionando. Son **referencia visual y de comportamiento**, no el código de producción — el estado vive en una clase JS simple y los datos están embebidos.

## Orden sugerido de implementación

1. **Sistema visual + topbar compartido** (`sistema-visual.md`). El topbar con hamburger es idéntico en las seis pantallas: un componente, no seis copias. Lo mismo el color por estación.
2. **NOC** — la más usada y la que fija el vocabulario de estados.
3. **Incidentes** y **Reporte SLA** — comparten el concepto de ráfaga y de tiempo caído.
4. **Discrepancias DAC** y **OCR de placas** — comparten el umbral de error por vía.
5. **Reportes** — depende de que las cinco anteriores tengan sus endpoints.

## Decisiones transversales que hay que respetar

Estas se repiten en varias pantallas y son la diferencia entre un tablero que se lee y uno que no:

- **Escalas que no empiezan en cero cuando el rango útil es angosto.** Uptime mapea 90–100%, efectividad DAC 85–100%. Con 0–100 todo se ve igual.
- **Escala logarítmica declarada** en la tendencia de Incidentes: una ráfaga de 1,411 contra días de 12 aplasta cualquier eje lineal. El subtítulo avisa que es log — un eje log sin avisar es engañoso.
- **Una ráfaga es un evento, no N incidentes.** 1,411 caídas en un minuto y siete estaciones son una caída de enlace. Los KPI necesitan el conteo agrupado además del crudo.
- **Ausencia de dato nunca se pinta como "bien".** Gris neutro en el heatmap OCR, borde tenue en el grid del NOC.
- **El color se gasta en lo que está mal.** En el NOC el grid de 200 equipos es casi invisible salvo donde hay falla. Verde saturado en todo = ningún foco.
- **`0m` nunca para un evento abierto**: se muestra `activo` en ámbar.
- **Contraste de muro**: el mínimo es 24px para cifras y 14px para texto secundario; nada por debajo, porque estas pantallas se ven a distancia.

## Qué NO está resuelto

- Estados de carga, vacío y error de cada panel. Definirlos antes de conectar datos.
- Responsive: todo está fijado a 1920×1080 (muro / monitor de operador). Si va a verse en laptop hay que decidir qué se corta.
- Datos: los números de las plantillas son representativos, tomados de las capturas originales. No son producción.
- Programación de envío recurrente en Reportes (propuesta, no construida).
