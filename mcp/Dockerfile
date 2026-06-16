FROM golang:1.25-alpine AS build
WORKDIR /src
COPY mcp/go.mod ./go.mod
COPY mcp/cmd ./cmd
COPY mcp/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/mcp-server ./cmd/mcp-server

FROM alpine:3.22 AS certs
RUN apk --no-cache add ca-certificates

FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/mcp-server /mcp-server
EXPOSE 8080
ENTRYPOINT ["/mcp-server"]
