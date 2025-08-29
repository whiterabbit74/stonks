#!/bin/bash

# 🔄 СИСТЕМА ОТКАТА К ПРЕДЫДУЩЕЙ ВЕРСИИ
# Восстанавливает предыдущую рабочую версию системы

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

# Поиск предыдущих образов
find_previous_images() {
    log_info "Ищу предыдущие версии образов..."

    # Найти предыдущий сервер образ
    prev_server=$(docker images stonks-server --format "{{.ID}}" | sed -n '2p')
    if [[ -n "$prev_server" ]]; then
        log_success "Найден предыдущий сервер: $prev_server"
    else
        log_error "Предыдущий сервер образ не найден"
        return 1
    fi

    # Найти предыдущий frontend образ
    prev_frontend=$(docker images stonks-frontend --format "{{.ID}}" | sed -n '2p')
    if [[ -n "$prev_frontend" ]]; then
        log_success "Найден предыдущий frontend: $prev_frontend"
    else
        log_error "Предыдущий frontend образ не найден"
        return 1
    fi

    return 0
}

# Создание бэкапа текущего состояния
backup_current_state() {
    log_info "Создаю бэкап текущего состояния..."

    backup_dir="rollback_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # Сохранить логи
    docker logs stonks-server > "$backup_dir/current_server.log" 2>&1 || true
    docker logs stonks-frontend > "$backup_dir/current_frontend.log" 2>&1 || true

    # Сохранить образы
    log_info "Сохраняю текущие образы..."
    docker save stonks-server:latest > "$backup_dir/current_server.tar" 2>/dev/null || true
    docker save stonks-frontend:latest > "$backup_dir/current_frontend.tar" 2>/dev/null || true

    log_success "Бэкап создан: $backup_dir"
}

# Откат к предыдущим образам
rollback_images() {
    log_info "Выполняю откат к предыдущим образам..."

    # Остановить текущие сервисы
    docker compose down

    # Удалить текущие образы (но сохранить для бэкапа)
    log_info "Удаляю текущие образы..."
    docker rmi stonks-server:latest 2>/dev/null || true
    docker rmi stonks-frontend:latest 2>/dev/null || true

    # Переименовать предыдущие образы
    log_info "Восстанавливаю предыдущие образы..."
    docker tag "$prev_server" stonks-server:latest
    docker tag "$prev_frontend" stonks-frontend:latest

    # Запустить сервисы с предыдущими образами
    docker compose up -d

    log_success "Откат выполнен"
}

# Проверка после отката
verify_rollback() {
    log_info "Проверяю результат отката..."

    # Подождать запуска
    sleep 30

    # Проверить статус
    if docker compose ps | grep -q "Up"; then
        log_success "Сервисы запустились после отката"

        # Проверить доступность
        if curl -f -s --max-time 10 http://localhost/ > /dev/null 2>&1; then
            log_success "Frontend доступен"
        else
            log_warning "Frontend может быть недоступен"
        fi

        if curl -f -s --max-time 10 http://localhost:3001/api/status > /dev/null 2>&1; then
            log_success "API доступен"
        else
            log_warning "API может быть недоступен"
        fi

    else
        log_error "Сервисы не запустились после отката!"
        docker compose logs
        return 1
    fi

    return 0
}

# Основная функция
main() {
    echo "=========================================="
    log_info "🔄 НАЧИНАЮ ОТКАТ СИСТЕМЫ"
    echo "=========================================="

    # Подтверждение
    read -p "Вы уверены, что хотите выполнить откат? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Откат отменен"
        exit 0
    fi

    # Шаг 1: Найти предыдущие образы
    if ! find_previous_images; then
        log_error "Не могу выполнить откат - предыдущие образы не найдены"
        exit 1
    fi

    # Шаг 2: Создать бэкап
    backup_current_state

    # Шаг 3: Выполнить откат
    if rollback_images; then
        # Шаг 4: Проверить результат
        if verify_rollback; then
            log_success "🎉 ОТКАТ ЗАВЕРШЕН УСПЕШНО!"
            echo
            log_info "Что произошло:"
            log_info "✅ Предыдущие образы восстановлены"
            log_info "✅ Сервисы перезапущены"
            log_info "✅ Система проверена"
            echo
            log_info "Бэкап текущего состояния: $backup_dir"
            log_info "Для возврата к новой версии выполните: docker compose build && docker compose up -d"
        else
            log_error "Откат выполнен, но есть проблемы со здоровьем системы"
            log_info "Проверьте логи: docker compose logs"
        fi
    else
        log_error "Откат провален!"
        exit 1
    fi
}

# Запуск
main "$@"
