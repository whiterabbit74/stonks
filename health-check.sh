#!/bin/bash

# 🏥 СИСТЕМА МОНИТОРИНГА ЗДОРОВЬЯ
# Проверяет состояние всех компонентов системы

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Функции
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка контейнеров
check_containers() {
    log_info "Проверяю Docker контейнеры..."

    local containers=("stonks-server" "stonks-frontend" "stonks-caddy")
    local all_healthy=true

    for container in "${containers[@]}"; do
        if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
            status=$(docker ps --format "{{.Status}}" --filter "name=${container}")
            if [[ $status == *"healthy"* ]] || [[ $status == *"Up"* ]]; then
                log_success "✅ $container: $status"
            else
                log_warning "⚠️  $container: $status"
                all_healthy=false
            fi
        else
            log_error "❌ $container: НЕ ЗАПУЩЕН"
            all_healthy=false
        fi
    done

    if [[ "$all_healthy" == "true" ]]; then
        log_success "Все контейнеры работают корректно"
    else
        log_warning "Некоторые контейнеры имеют проблемы"
    fi

    return $([ "$all_healthy" == "true" ])
}

# Проверка API
check_api() {
    log_info "Проверяю API endpoints..."

    local endpoints=(
        "http://localhost:3001/api/status"
        "http://localhost:3001/api/splits"
        "https://tradingibs.site/api/status"
    )

    local all_ok=true

    for endpoint in "${endpoints[@]}"; do
        if curl -f -s --max-time 10 "$endpoint" > /dev/null 2>&1; then
            log_success "✅ $endpoint: OK"
        else
            status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$endpoint" 2>/dev/null || echo "FAILED")
            if [[ "$status_code" == "401" ]]; then
                log_success "✅ $endpoint: 401 (требует авторизации)"
            else
                log_error "❌ $endpoint: HTTP $status_code"
                all_ok=false
            fi
        fi
    done

    if [[ "$all_ok" == "true" ]]; then
        log_success "API работает корректно"
    else
        log_warning "API имеет проблемы"
    fi

    return $([ "$all_ok" == "true" ])
}

# Проверка frontend
check_frontend() {
    log_info "Проверяю frontend..."

    local urls=(
        "http://localhost/"
        "https://tradingibs.site/"
    )

    local all_ok=true

    for url in "${urls[@]}"; do
        if curl -f -s --max-time 10 "$url" > /dev/null 2>&1; then
            log_success "✅ $url: OK"

            # Проверить наличие основных файлов
            if curl -s "$url" | grep -q "index-B0SCp-Ld.js"; then
                log_success "  └─ JavaScript файлы загружены"
            else
                log_warning "  └─ JavaScript файлы могут быть устаревшими"
            fi
        else
            log_error "❌ $url: НЕДОСТУПЕН"
            all_ok=false
        fi
    done

    if [[ "$all_ok" == "true" ]]; then
        log_success "Frontend работает корректно"
    else
        log_error "Frontend имеет проблемы"
    fi

    return $([ "$all_ok" == "true" ])
}

# Проверка ресурсов
check_resources() {
    log_info "Проверяю системные ресурсы..."

    # Память
    mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [[ $mem_usage -gt 80 ]]; then
        log_error "❌ Высокое использование памяти: ${mem_usage}%"
    elif [[ $mem_usage -gt 60 ]]; then
        log_warning "⚠️  Высокое использование памяти: ${mem_usage}%"
    else
        log_success "✅ Использование памяти: ${mem_usage}%"
    fi

    # Диск
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        log_error "❌ Высокое использование диска: ${disk_usage}%"
    elif [[ $disk_usage -gt 75 ]]; then
        log_warning "⚠️  Высокое использование диска: ${disk_usage}%"
    else
        log_success "✅ Использование диска: ${disk_usage}%"
    fi
}

# Проверка логов
check_logs() {
    log_info "Проверяю логи на ошибки..."

    # Проверить логи сервера на ошибки
    server_errors=$(docker logs --since 1h stonks-server 2>&1 | grep -i error | wc -l)
    if [[ $server_errors -gt 0 ]]; then
        log_warning "⚠️  Найдено $server_errors ошибок в логах сервера за последний час"
        docker logs --since 1h stonks-server 2>&1 | grep -i error | tail -5
    else
        log_success "✅ Ошибок в логах сервера не найдено"
    fi

    # Проверить логи nginx на ошибки
    nginx_errors=$(docker logs --since 1h stonks-frontend 2>&1 | grep -i error | wc -l)
    if [[ $nginx_errors -gt 0 ]]; then
        log_warning "⚠️  Найдено $nginx_errors ошибок в логах nginx за последний час"
    else
        log_success "✅ Ошибок в логах nginx не найдено"
    fi
}

# Основная функция
main() {
    echo "=========================================="
    log_info "🏥 ПРОВЕРКА ЗДОРОВЬЯ СИСТЕМЫ"
    echo "=========================================="

    local overall_status=0

    # Запустить все проверки
    check_containers || overall_status=1
    echo
    check_api || overall_status=1
    echo
    check_frontend || overall_status=1
    echo
    check_resources
    echo
    check_logs

    echo
    echo "=========================================="

    if [[ $overall_status -eq 0 ]]; then
        log_success "🎉 СИСТЕМА ЗДОРОВА!"
    else
        log_error "❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ!"
        echo
        log_info "Рекомендации:"
        log_info "1. Проверьте логи: docker compose logs"
        log_info "2. Перезапустите сервисы: docker compose restart"
        log_info "3. При необходимости откатитесь: ./rollback.sh"
    fi

    return $overall_status
}

# Запуск
main "$@"
