#!/bin/bash

# 🤖 АВТОМАТИЗИРОВАННАЯ СИСТЕМА ОБНОВЛЕНИЙ
# Проверяет наличие обновлений и применяет их автоматически

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Настройки
REPO_URL="https://github.com/whiterabbit74/stonks.git"
UPDATE_INTERVAL=3600  # Проверять каждые 60 минут
LOG_FILE="auto-update.log"

# Функции
log_info() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" | tee -a "$LOG_FILE"
}

# Проверка здоровья системы
check_system_health() {
    log_info "Проверяю здоровье системы..."

    # Проверить контейнеры
    if ! docker ps --format "{{.Names}}" | grep -q "stonks-server"; then
        log_error "stonks-server не запущен"
        return 1
    fi

    if ! docker ps --format "{{.Names}}" | grep -q "stonks-frontend"; then
        log_error "stonks-frontend не запущен"
        return 1
    fi

    # Проверить API
    if ! curl -f -s --max-time 5 http://localhost:3001/api/status > /dev/null 2>&1; then
        log_error "API недоступен"
        return 1
    fi

    # Проверить frontend
    if ! curl -f -s --max-time 5 http://localhost/ > /dev/null 2>&1; then
        log_error "Frontend недоступен"
        return 1
    fi

    log_success "Система здорова"
    return 0
}

# Проверка наличия обновлений
check_for_updates() {
    log_info "Проверяю наличие обновлений..."

    # Получить текущий коммит
    current_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

    # Получить последний коммит из репозитория
    latest_commit=$(curl -s "https://api.github.com/repos/whiterabbit74/stonks/commits/main" | grep '"sha"' | head -1 | cut -d'"' -f4)

    if [[ -z "$latest_commit" ]]; then
        log_error "Не удалось получить информацию о последнем коммите"
        return 1
    fi

    log_info "Текущий коммит: ${current_commit:0:8}"
    log_info "Последний коммит: ${latest_commit:0:8}"

    if [[ "$current_commit" == "$latest_commit" ]]; then
        log_success "Обновления не найдены"
        return 1
    else
        log_info "Найдены обновления! Начинаю процесс обновления..."
        return 0
    fi
}

# Применение обновлений
apply_updates() {
    log_info "Применяю обновления..."

    # Создать бэкап
    backup_dir="auto_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # Сохранить текущую конфигурацию
    cp docker-compose.yml nginx.conf .env "$backup_dir/" 2>/dev/null || true

    # Скачать последние изменения
    log_info "Скачиваю последние изменения..."
    git fetch origin main
    git reset --hard origin/main

    # Проверить наличие необходимых файлов
    if [[ ! -f "docker-compose.yml" || ! -f "nginx.conf" ]]; then
        log_error "Отсутствуют необходимые файлы после обновления"
        # Восстановить из бэкапа
        cp "$backup_dir"/* ./ 2>/dev/null || true
        return 1
    fi

    # Запустить умный деплой
    if [[ -f "deploy.sh" ]]; then
        log_info "Запускаю умный деплой..."
        chmod +x deploy.sh
        ./deploy.sh
    else
        log_warning "deploy.sh не найден, использую стандартный деплой"
        docker compose down
        docker compose build --no-cache
        docker compose up -d
    fi

    log_success "Обновления применены"
}

# Очистка старых файлов
cleanup_old_files() {
    log_info "Очищаю старые файлы..."

    # Удалить старые логи (старше 7 дней)
    find . -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true

    # Удалить старые бэкапы (оставить последние 5)
    ls -td backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
    ls -td auto_backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

    # Очистить Docker
    docker system prune -f > /dev/null 2>&1

    log_success "Очистка завершена"
}

# Отправка уведомления
send_notification() {
    local message="$1"
    local status="$2"

    # Здесь можно добавить отправку уведомлений в Telegram или email
    log_info "Уведомление: $message (Status: $status)"

    # Пример отправки в Telegram (если настроен)
    if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=🚀 Trading Strategies Update: $message" > /dev/null 2>&1 || true
    fi
}

# Основная функция
main() {
    log_info "🤖 НАЧИНАЮ АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ"
    echo "========================================"

    local update_applied=false

    # Шаг 1: Проверить здоровье системы
    if ! check_system_health; then
        log_error "Система нездорова, пропускаю обновление"
        send_notification "Система нездорова - обновление пропущено" "ERROR"
        exit 1
    fi

    # Шаг 2: Проверить обновления
    if check_for_updates; then
        # Шаг 3: Применить обновления
        if apply_updates; then
            update_applied=true
            log_success "Обновления успешно применены"

            # Шаг 4: Проверить здоровье после обновления
            if check_system_health; then
                send_notification "Обновления успешно применены" "SUCCESS"
            else
                send_notification "Обновления применены, но система нездорова" "WARNING"
            fi
        else
            log_error "Не удалось применить обновления"
            send_notification "Не удалось применить обновления" "ERROR"
            exit 1
        fi
    fi

    # Шаг 5: Очистка
    cleanup_old_files

    # Шаг 6: Финальный отчет
    echo "========================================"
    if [[ "$update_applied" == "true" ]]; then
        log_success "🎉 АВТООБНОВЛЕНИЕ ЗАВЕРШЕНО!"
    else
        log_info "✅ Система в актуальном состоянии"
    fi
}

# Режим демона (бесконечный цикл)
if [[ "$1" == "daemon" ]]; then
    log_info "Запуск в режиме демона (проверка каждые $UPDATE_INTERVAL секунд)"

    while true; do
        main
        log_info "Жду $UPDATE_INTERVAL секунд до следующей проверки..."
        sleep $UPDATE_INTERVAL
    done
else
    # Одноразовый запуск
    main
fi
