namespace AunorApi.Services.NetMon;

public enum AccionAlerta { Nada, Abrir, Cerrar }

// Regla de saturación de UN enlace, sin I/O: se abre tras N muestras consecutivas sobre el
// umbral crítico y se cierra cuando baja de (crítico - histéresis), para evitar parpadeo.
// Una sola alerta abierta a la vez (Abierta). Solo se alimenta con muestras válidas:
// las descartadas (reinicio de contadores, failover) no cuentan ni cierran nada.
public class EvaluadorSaturacion(int muestrasConsecutivas = 5, double histeresisPct = 10)
{
    int consecutivas;
    public bool Abierta { get; private set; }

    // Tras un reinicio del servicio la alerta puede seguir abierta en BD: se re-sincroniza.
    public void MarcarAbierta(bool abierta) { Abierta = abierta; if (abierta) consecutivas = 0; }

    public AccionAlerta Procesar(double utilPct, double umbralCritPct)
    {
        if (!Abierta)
        {
            consecutivas = utilPct > umbralCritPct ? consecutivas + 1 : 0;
            if (consecutivas < muestrasConsecutivas) return AccionAlerta.Nada;
            Abierta = true;
            consecutivas = 0;
            return AccionAlerta.Abrir;
        }

        if (utilPct < umbralCritPct - histeresisPct)
        {
            Abierta = false;
            return AccionAlerta.Cerrar;
        }
        return AccionAlerta.Nada;
    }
}
