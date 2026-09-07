FROM mcr.microsoft.com/mssql/server:2022-latest

USER root
COPY entrypoint.sh /entrypoint.sh
COPY init.sql      /init.sql
RUN chmod +x /entrypoint.sh \
    && sed -i 's/\r//' /entrypoint.sh

USER mssql
ENTRYPOINT ["/entrypoint.sh"]
