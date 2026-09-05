#!/bin/bash

# 🧹 СИСТЕМА ОЧИСТКИ СЕРВЕРА
# Удаляет старые файлы, образы и освобождает место

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

# Очистка Docker
cleanup_docker() {
    log_info "Очищаю Docker..."

    # Остановить все контейнеры
    docker stop $(docker ps -aq) 2>/dev/null || true

    # Удалить все контейнеры
    docker rm $(docker ps -aq) 2>/dev/null || true

    # Удалить все образы кроме последних версий
    log_info "Удаляю старые образы..."

    # Сохранить последние версии
    docker tag stonks-server:latest stonks-server:latest-backup 2>/dev/null || true

    # Удалить все образы
    docker rmi $(docker images -q) 2>/dev/null || true

    # Восстановить последние версии
    docker tag stonks-server:latest-backup stonks-server:latest 2>/dev/null || true
    docker rmi stonks-server:latest-backup 2>/dev/null || true

    # Named volumes (stonks_db, datasets, Caddy certs) stay. Do not prune
    # dangling volumes after the container rm above.
    docker system prune -af
    docker network prune -f

    log_success "Docker очищен"
}

# Очистка временных файлов
cleanup_temp_files() {
    log_info "Очищаю временные файлы..."

    # Удалить архивы
    rm -f *.tgz *.tar.gz 2>/dev/null || true

    # Удалить логи старше 7 дней
    find . -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true

    # Удалить временные файлы
    find . -name "tmp_*" -type f -mtime +1 -delete 2>/dev/null || true
    find . -name "*.tmp" -type f -mtime +1 -delete 2>/dev/null || true

    log_success "Временные файлы очищены"
}

# Очистка старых бэкапов
cleanup_backups() {
    log_info "Очищаю старые бэкапы..."

    # Удалить бэкапы старше 30 дней
    find . -name "backup_*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
    find . -name "auto_backup_*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
    find . -name "rollback_backup_*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true

    # Оставить только последние 5 бэкапов каждого типа
    for pattern in "backup_*" "auto_backup_*" "rollback_backup_*"; do
        backup_count=$(ls -1d ${pattern} 2>/dev/null | wc -l)
        if [[ $backup_count -gt 5 ]]; then
            ls -1td ${pattern} 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
        fi
    done

    log_success "Старые бэкапы очищены"
}

# Проверка места на диске
check_disk_space() {
    log_info "Проверяю использование диска..."

    # Показать текущее использование
    df -h /

    # Показать самые большие папки
    log_info "Самые большие папки:"
    du -sh * 2>/dev/null | sort -hr | head -10 || true

    # Показать использование Docker
    log_info "Использование Docker:"
    docker system df
}

# Основная функция
main() {
    echo "=========================================="
    log_info "🧹 НАЧИНАЮ ОЧИСТКУ СЕРВЕРА"
    echo "=========================================="

    # Предупреждение
    log_warning "⚠️  ВНИМАНИЕ!"
    log_warning "Эта операция удалит:"
    log_warning "  - Все остановленные контейнеры"
    log_warning "  - Старые Docker образы"
    log_warning "  - Временные файлы"
    log_warning "  - Старые бэкапы (старше 30 дней)"
    echo

    read -p "Продолжить? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Очистка отменена"
        exit 0
    fi

    # Проверка места до очистки
    log_info "Место на диске ДО очистки:"
    check_disk_space
    echo

    # Шаг 1: Очистка временных файлов
    cleanup_temp_files

    # Шаг 2: Очистка бэкапов
    cleanup_backups

    # Шаг 3: Очистка Docker
    cleanup_docker

    echo
    # Проверка места после очистки
    log_info "Место на диске ПОСЛЕ очистки:"
    check_disk_space

    echo
    echo "=========================================="
    log_success "🎉 ОЧИСТКА СЕРВЕРА ЗАВЕРШЕНА!"
    echo
    log_info "Рекомендации:"
    log_info "1. Перезапустите сервисы: docker compose up -d"
    log_info "2. Проверьте здоровье: ./health-check.sh"
    log_info "3. Настройте автообновление: ./auto-update.sh daemon"
}
