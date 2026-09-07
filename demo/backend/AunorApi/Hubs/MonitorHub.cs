using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace AunorApi.Hubs;

[Authorize]
public class MonitorHub : Hub
{
    // Eventos que el servidor empuja a los clientes:
    //   EquipoStatusChanged(equipoId, estado, latenciaMs, timestamp)
    //   KpiUpdated(ups, downs, total, incActivos)
    //   IncidenteAbierto(equipoId, equipoNombre, inicio)
    //   IncidenteCerrado(equipoId, fin, duracionMin)
    //   CamaraUpdated(camara, ultimoEmail, minDesdeEmail, online)
}
