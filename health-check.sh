#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_containers() {
    log_info "Проверяю Docker контейнеры..."
    local containers=("stonks-server" "stonks-mcp" "stonks-caddy")
    local all_healthy=true
    for container in "${containers[@]}"; do
        if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
            status=$(docker ps --format "{{.Status}}" --filter "name=${container}")
            if [[ $status == *"healthy"* ]] || [[ $status == *"Up"* ]]; then
                log_success "$container: $status"
            else
                log_warning "$container: $status"
                all_healthy=false
            fi
        else
            log_error "$container: НЕ ЗАПУЩЕН"
            all_healthy=false
        fi
    done
    return $([ "$all_healthy" == "true" ])
}

check_api() {
    log_info "Проверяю API endpoints..."
    local endpoints=(
        "http://localhost:3001/api/status"
        "http://localhost:3001/api/splits"
        "https://mktorder.com/api/status"
        "https://mktorder.com/mcp/transcribe/healthz"
        "https://mktorder.com/music/api/health"
    )
    local all_ok=true
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s --max-time 10 "$endpoint" > /dev/null 2>&1; then
            log_success "$endpoint: OK"
        else
            status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$endpoint" 2>/dev/null || echo "FAILED")
            if [[ "$status_code" == "401" ]]; then
                log_success "$endpoint: 401 (требует авторизации)"
            else
                log_error "$endpoint: HTTP $status_code"
                all_ok=false
            fi
        fi
    done
    return $([ "$all_ok" == "true" ])
}

check_site() {
    log_info "Проверяю сайт..."
    local urls=("http://localhost/" "https://mktorder.com/")
    local all_ok=true
    for url in "${urls[@]}"; do
        body=$(curl -fsS --max-time 10 "$url" 2>/dev/null || true)
        if echo "$body" | grep -q "/js/app.js"; then
            log_success "$url: OK"
        else
            log_error "$url: недоступен или это не Go SPA"
            all_ok=false
        fi
    done
    return $([ "$all_ok" == "true" ])
}

check_resources() {
    log_info "Проверяю системные ресурсы..."
    mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [[ $mem_usage -gt 80 ]]; then
        log_error "Высокое использование памяти: ${mem_usage}%"
    elif [[ $mem_usage -gt 60 ]]; then
        log_warning "Высокое использование памяти: ${mem_usage}%"
    else
        log_success "Использование памяти: ${mem_usage}%"
    fi
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        log_error "Высокое использование диска: ${disk_usage}%"
    elif [[ $disk_usage -gt 75 ]]; then
        log_warning "Высокое использование диска: ${disk_usage}%"
    else
        log_success "Использование диска: ${disk_usage}%"
    fi
}

check_logs() {
    log_info "Проверяю логи на ошибки..."
    for name in stonks-server stonks-mcp stonks-caddy; do
        errors=$(docker logs --since 1h "$name" 2>&1 | grep -i error | wc -l)
        if [[ $errors -gt 0 ]]; then
            log_warning "$name: $errors ошибок за последний час"
            docker logs --since 1h "$name" 2>&1 | grep -i error | tail -5
        else
            log_success "$name: ошибок не найдено"
        fi
    done
}

main() {
    echo "=========================================="
    log_info "ПРОВЕРКА ЗДОРОВЬЯ СИСТЕМЫ"
    echo "=========================================="
    local overall_status=0
    check_containers || overall_status=1
    echo
    check_api || overall_status=1
    echo
    check_site || overall_status=1
    echo
    check_resources
    echo
    check_logs
    echo
    echo "=========================================="
    if [[ $overall_status -eq 0 ]]; then
        log_success "СИСТЕМА ЗДОРОВА"
    else
        log_error "ОБНАРУЖЕНЫ ПРОБЛЕМЫ"
        log_info "docker compose logs"
        log_info "docker compose restart"
    fi
    return $overall_status
}

main "$@"
