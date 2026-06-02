FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY AunorApi/AunorApi.csproj ./AunorApi/
RUN dotnet restore ./AunorApi/AunorApi.csproj
COPY AunorApi/ ./AunorApi/
RUN dotnet publish ./AunorApi/AunorApi.csproj -c Release -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /publish .
ENTRYPOINT ["dotnet", "AunorApi.dll"]
