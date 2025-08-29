#!/bin/bash

# 🚀 УМНЫЙ ДЕПЛОЙ СИСТЕМЫ НА СЕРВЕР
# Автоматизированный процесс обновления с проверками

set -e  # Остановить скрипт при первой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Проверка наличия необходимых файлов
check_requirements() {
    log_info "Проверяю необходимые файлы..."

    required_files=("docker-compose.yml" "nginx.conf" ".env")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Отсутствует файл: $file"
            exit 1
        fi
    done

    # Проверка на синтаксис TypeScript в JS файлах
    if grep -r ":\s*\(string\|number\|boolean\|Array\|Record\)" server/ --include="*.js" | grep -v "//"; then
        log_error "Найден TypeScript синтаксис в JavaScript файлах!"
        log_error "Исправьте перед деплоем:"
        grep -r ":\s*\(string\|number\|boolean\|Array\|Record\)" server/ --include="*.js" | grep -v "//"
        exit 1
    fi

    log_success "Все проверки пройдены"
}

# Очистка старых образов
cleanup_old_images() {
    log_info "Очищаю старые Docker образы..."

    # Удалить dangling образы (неиспользуемые)
    docker image prune -f

    # Удалить старые версии образов (оставить последние 3)
    docker images --format "table {{.Repository}}\t{{.ID}}" | grep -E "(stonks-server|stonks-frontend)" | tail -n +4 | while read repo id; do
        if [[ -n "$id" ]]; then
            log_info "Удаляю старый образ: $repo ($id)"
            docker rmi "$id" 2>/dev/null || true
        fi
    done

    log_success "Очистка завершена"
}

# Создание бэкапа
create_backup() {
    log_info "Создаю бэкап текущего состояния..."

    backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # Сохранить текущие логи
    docker logs stonks-server > "$backup_dir/server.log" 2>&1 || true
    docker logs stonks-frontend > "$backup_dir/frontend.log" 2>&1 || true

    # Сохранить конфигурацию
    cp docker-compose.yml "$backup_dir/" 2>/dev/null || true
    cp nginx.conf "$backup_dir/" 2>/dev/null || true
    cp .env "$backup_dir/" 2>/dev/null || true

    log_info "Бэкап создан: $backup_dir"
}

# Пересборка и запуск
rebuild_and_deploy() {
    log_info "Пересобираю и запускаю сервисы..."

    # Остановить сервисы
    docker compose down

    # Пересобрать с кэшем (быстрее)
    docker compose build

    # Запустить сервисы
    docker compose up -d

    # Подождать запуска
    log_info "Жду запуска сервисов..."
    sleep 30

    # Проверить статус
    if docker compose ps | grep -q "Up"; then
        log_success "Сервисы запущены успешно"
    else
        log_error "Сервисы не запустились!"
        docker compose logs
        exit 1
    fi
}

# Проверка здоровья
health_check() {
    log_info "Проверяю здоровье сервисов..."

    max_attempts=10
    attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Попытка $attempt/$max_attempts..."

        # Проверить frontend
        if curl -f -s http://localhost/ > /dev/null 2>&1; then
            log_success "Frontend доступен"
            frontend_ok=true
        else
            log_warning "Frontend недоступен"
            frontend_ok=false
        fi

        # Проверить API
        if curl -f -s http://localhost:3001/api/status > /dev/null 2>&1; then
            log_success "API доступен"
            api_ok=true
        else
            log_warning "API недоступен"
            api_ok=false
        fi

        if [[ "$frontend_ok" == "true" && "$api_ok" == "true" ]]; then
            log_success "Все сервисы здоровы!"
            return 0
        fi

        sleep 10
        ((attempt++))
    done

    log_error "Сервисы не прошли health check!"
    docker compose logs
    return 1
}

# Роллбэк при неудаче
rollback() {
    log_error "Выполняю откат к предыдущей версии..."

    # Остановить текущие сервисы
    docker compose down

    # Найти предыдущий образ
    prev_server=$(docker images stonks-server --format "{{.ID}}" | sed -n '2p')
    prev_frontend=$(docker images stonks-frontend --format "{{.ID}}" | sed -n '2p')

    if [[ -n "$prev_server" && -n "$prev_frontend" ]]; then
        log_info "Использую предыдущие образы: server=$prev_server, frontend=$prev_frontend"

        # Запустить с предыдущими образами
        PREV_SERVER_IMAGE=$prev_server PREV_FRONTEND_IMAGE=$prev_frontend docker compose up -d

        log_warning "Откат выполнен. Проверьте работу системы."
    else
        log_error "Предыдущие образы не найдены! Ручная интервенция требуется."
        exit 1
    fi
}

# Основная функция
main() {
    log_info "🚀 НАЧИНАЮ ДЕПЛОЙ СИСТЕМЫ"
    echo "========================================"

    # Шаг 1: Проверки
    check_requirements

    # Шаг 2: Очистка
    cleanup_old_images

    # Шаг 3: Бэкап
    create_backup

    # Шаг 4: Деплой
    if rebuild_and_deploy; then
        # Шаг 5: Health check
        if health_check; then
            log_success "🎉 ДЕПЛОЙ ЗАВЕРШЕН УСПЕШНО!"
            log_info "Сервисы доступны:"
            log_info "  - Frontend: http://localhost/"
            log_info "  - API: http://localhost:3001/api/"
            log_info "  - Production: https://tradingibs.site/"
        else
            log_error "Health check провален!"
            rollback
            exit 1
        fi
    else
        log_error "Деплой провален!"
        rollback
        exit 1
    fi
}

# Запуск
main "$@"