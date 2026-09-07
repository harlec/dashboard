FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY AunorApi/AunorApi.csproj ./AunorApi/
RUN dotnet restore ./AunorApi/AunorApi.csproj
COPY AunorApi/ ./AunorApi/
RUN dotnet publish ./AunorApi/AunorApi.csproj -c Release -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
# fonts-dejavu-core: fuente TTF necesaria para el font resolver de PdfSharpCore
# (Linux no tiene GDI+/fontconfig disponible para PdfSharpCore por defecto)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /publish .
ENTRYPOINT ["dotnet", "AunorApi.dll"]
