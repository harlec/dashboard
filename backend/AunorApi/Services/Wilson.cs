namespace AunorApi.Services;

// Límite inferior del intervalo de confianza de Wilson (95%) para una proporción,
// expresado en % (0–100). Responde "¿tenemos evidencia de que la tasa REAL supera X%?"
// sin que una muestra chica dispare falsas alarmas:
//   1 discrepancia en 2 tránsitos  → 50% "a secas", pero límite inferior ≈ 9.5%  (poca evidencia)
//   40 discrepancias en 100        → 40% "a secas", límite inferior ≈ 30.9%      (evidencia real)
// Con mucho volumen el límite converge al % normal.
public static class Wilson
{
    private const double Z95 = 1.959963985;

    public static double LimiteInferior(int exitos, int total)
    {
        if (total <= 0) return 0;
        double n = total;
        double p = Math.Clamp(exitos, 0, total) / n;
        double z2 = Z95 * Z95;
        double denom = 1 + z2 / n;
        double centro = p + z2 / (2 * n);
        double ajuste = Z95 * Math.Sqrt((p * (1 - p) + z2 / (4 * n)) / n);
        return Math.Max(0, (centro - ajuste) / denom) * 100;
    }
}
