# What-If AI Go Simulation Engine & API Gateway
# Build from ./engine-go context:
#   docker build -t whatif-engine-go ./engine-go

FROM golang:1.22-alpine AS builder

WORKDIR /src

COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/whatif-engine ./cmd/engine

FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup

COPY --from=builder /out/whatif-engine /usr/local/bin/whatif-engine

ENV PORT=8080 \
    ML_URL=http://ml-py:8000

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["/usr/local/bin/whatif-engine"]

