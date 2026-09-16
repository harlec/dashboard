namespace AunorApi.Services;

// Semáforo único para todos los sockets ICMP raw del proceso (ver el comentario
// extenso en PingWorkerService sobre el fan-out de sockets raw en Linux). Antes
// vivía como variable local dentro de PingWorkerService.ExecuteAsync — se saca a
// un singleton para que ServicioCheckWorkerService comparta el mismo cupo en vez
// de sumar sockets raw aparte y reabrir el mismo problema.
public class IcmpGate(IConfiguration config)
{
    public SemaphoreSlim Semaphore { get; } =
        new(config.GetValue("Ping:IcmpMaxParallel", 20));
}
