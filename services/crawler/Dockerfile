FROM golang:1.23-alpine AS build
WORKDIR /src
COPY services/crawler/go.mod ./
RUN go mod download
COPY services/crawler ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/crawler ./cmd/crawler

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && addgroup -S crawler && adduser -S -G crawler crawler
COPY --from=build /out/crawler /usr/local/bin/crawler
USER crawler
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/crawler"]
