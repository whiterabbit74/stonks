import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AppRouter from '../AppRouter';

const mocks = vi.hoisted(() => ({
  useAppStore: Object.assign(vi.fn(), { getState: vi.fn() }),
  scheduleIdleTask: vi.fn(() => () => undefined),
}));

vi.mock('../../stores', () => ({
  useAppStore: mocks.useAppStore,
}));

vi.mock('../../lib/prefetch', () => ({
  scheduleIdleTask: mocks.scheduleIdleTask,
}));

vi.mock('../Footer', () => ({
  Footer: () => <footer>footer</footer>,
}));

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <div>theme</div>,
}));

vi.mock('../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui')>();
  return {
    ...actual,
    BottomNav: () => null,
  };
});

vi.mock('../DataUpload', () => ({
  DataUpload: () => <div>Страница данных</div>,
}));
vi.mock('../DataEnhancer', () => ({
  DataEnhancer: () => <div>Страница загрузки API</div>,
}));
vi.mock('../TelegramWatches', () => ({
  TelegramWatches: () => <div>Страница мониторинга</div>,
}));
vi.mock('../AppSettings', () => ({
  AppSettings: () => <div>Страница настроек</div>,
}));
vi.mock('../SplitsTab', () => ({
  SplitsTab: () => <div>Страница сплитов</div>,
}));
vi.mock('../CalendarPage', () => ({
  CalendarPage: () => <div>Страница календаря</div>,
}));
vi.mock('../MultiTickerPage', () => ({
  MultiTickerPage: () => <div>Страница акций</div>,
}));
vi.mock('../EmaStrategyPage', () => ({
  EmaStrategyPage: () => <div>Страница EMA</div>,
}));
vi.mock('../MultiTickerOptionsPage', () => ({
  MultiTickerOptionsPage: () => <div>Страница опционов</div>,
}));
vi.mock('../WebullAccountPage', () => ({
  WebullAccountPage: () => <div>Страница брокера</div>,
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseHref(url: string, base = 'http://localhost:3000') {
  const href = /^https?:/.test(url)
    ? url
    : `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
  const [withoutHash, hash = ''] = href.split('#');
  const [originAndPath, query = ''] = withoutHash.split('?');
  const match = originAndPath.match(/^(https?:)\/\/([^/]+)(.*)$/);
  const protocol = match?.[1] ?? 'http:';
  const host = match?.[2] ?? 'localhost:3000';
  const pathname = match?.[3] || '/';
  const [hostname, port = ''] = host.split(':');
  return {
    href,
    origin: `${protocol}//${host}`,
    protocol,
    hostname,
    host,
    port,
    pathname,
    search: query ? `?${query}` : '',
    hash: hash ? `#${hash}` : '',
  };
}

function WorkingURL(url: string, base?: string) {
  return {
    ...parseHref(url, base),
    toString() {
      return parseHref(url, base).href;
    },
  };
}
WorkingURL.createObjectURL = () => 'blob:http://localhost:3000/mock-url';
WorkingURL.revokeObjectURL = () => undefined;

const originalPushState = window.history.pushState.bind(window.history);
const originalReplaceState = window.history.replaceState.bind(window.history);

function setPath(path: string) {
  const parsed = parseHref(path);
  const locationLike = {
    ...parsed,
    assign(next: string) {
      Object.assign(locationLike, parseHref(next, parsed.origin));
    },
    replace(next: string) {
      Object.assign(locationLike, parseHref(next, parsed.origin));
    },
    reload() {},
    toString() {
      return locationLike.href;
    },
  };

  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: locationLike,
  });

  window.history.pushState = (state, title, url) => {
    if (url != null && url !== '') {
      Object.assign(window.location, parseHref(String(url), window.location.origin));
    }
    try {
      return originalPushState(state, title, url);
    } catch {
      return undefined;
    }
  };
  window.history.replaceState = (state, title, url) => {
    if (url != null && url !== '') {
      Object.assign(window.location, parseHref(String(url), window.location.origin));
    }
    try {
      return originalReplaceState(state, title, url);
    } catch {
      return undefined;
    }
  };
}

function installFetchMock(initialAuthenticated = false) {
  let authenticated = initialAuthenticated;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/check')) {
      return json(
        authenticated ? { ok: true } : { error: 'unauthorized' },
        authenticated ? 200 : 401
      );
    }
    if (url.includes('/status')) {
      return json({ timestamp: 'build-test' });
    }
    if (url.includes('/login')) {
      const body = JSON.parse(String(init?.body || '{}')) as { password?: string };
      if (body.password === 'bad') {
        return json({ error: 'Неверный пароль' }, 401);
      }
      authenticated = true;
      return json({ ok: true });
    }
    if (url.includes('/logout')) {
      authenticated = false;
      return json({ ok: true });
    }
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const state = {
    marketData: [],
    currentStrategy: null,
    backtestResults: null,
    backtestStatus: 'idle',
    runBacktest: vi.fn(),
    setStrategy: vi.fn(),
    loadSettingsFromServer: vi.fn().mockResolvedValue(undefined),
    loadDatasetsFromServer: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mocks.useAppStore.mockImplementation((selector?: (s: typeof state) => unknown) => (
    typeof selector === 'function' ? selector(state) : state
  ));
  mocks.useAppStore.getState.mockReturnValue(state);
  return state;
}

function desktopNav() {
  return screen.getByRole('navigation');
}

describe('AppRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore();
    vi.stubGlobal('URL', WorkingURL);
    setPath('/');
  });

  afterEach(() => {
    cleanup();
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    vi.unstubAllGlobals();
  });

  it('sends an unauthenticated visitor from a protected route to /login', async () => {
    setPath('/data');
    installFetchMock(false);

    render(<AppRouter />);

    expect(screen.getByText('Проверка авторизации…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ivan@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Страница данных')).not.toBeInTheDocument();
  });

  it('renders the login page immediately at /login without an auth spinner', () => {
    setPath('/login');
    installFetchMock(false);

    render(<AppRouter />);

    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.queryByText('Проверка авторизации…')).not.toBeInTheDocument();
  });

  it('shows protected pages after a successful session check', async () => {
    setPath('/');
    const store = mockStore();
    installFetchMock(true);

    render(<AppRouter />);

    expect(await screen.findByText('Страница данных')).toBeInTheDocument();
    expect(within(desktopNav()).getByRole('link', { name: 'Данные' })).toBeInTheDocument();
    expect(store.loadSettingsFromServer).toHaveBeenCalled();
    expect(store.loadDatasetsFromServer).toHaveBeenCalled();
  });

  it('navigates between protected routes from the desktop tabs', async () => {
    setPath('/data');
    installFetchMock(true);

    render(<AppRouter />);
    expect(await screen.findByText('Страница данных')).toBeInTheDocument();

    fireEvent.click(within(desktopNav()).getByRole('link', { name: 'Акции' }));
    expect(await screen.findByText('Страница акций')).toBeInTheDocument();

    fireEvent.click(within(desktopNav()).getByRole('link', { name: 'Календарь' }));
    expect(await screen.findByText('Страница календаря')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Настройки' }));
    expect(await screen.findByText('Страница настроек')).toBeInTheDocument();
  });

  it('redirects /results to the stocks page', async () => {
    setPath('/results');
    installFetchMock(true);

    render(<AppRouter />);

    expect(await screen.findByText('Страница акций')).toBeInTheDocument();
    expect(screen.queryByText('Страница данных')).not.toBeInTheDocument();
  });

  it('redirects an unknown path to /data for an authenticated user', async () => {
    setPath('/this-route-does-not-exist');
    installFetchMock(true);

    render(<AppRouter />);

    expect(await screen.findByText('Страница данных')).toBeInTheDocument();
  });

  it('sends an unauthenticated visitor from an unknown path to /login', async () => {
    setPath('/missing');
    installFetchMock(false);

    render(<AppRouter />);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.queryByText('Страница данных')).not.toBeInTheDocument();
  });

  it('returns to the originally requested protected page after login', async () => {
    setPath('/calendar');
    installFetchMock(false);

    render(<AppRouter />);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('ivan@example.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Страница календаря')).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    const loginCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/login'));
    expect(loginCall?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      username: 'admin@example.com',
      password: 'secret',
      remember: false,
    });
  });

  it('stays on /login and shows the server error when credentials are rejected', async () => {
    setPath('/login');
    installFetchMock(false);

    render(<AppRouter />);

    fireEvent.change(screen.getByPlaceholderText('ivan@example.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'bad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Неверный пароль')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.queryByText('Страница данных')).not.toBeInTheDocument();
  });

  it('logs out and returns to /login', async () => {
    setPath('/data');
    installFetchMock(true);

    render(<AppRouter />);
    expect(await screen.findByText('Страница данных')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => (
        String(input).includes('/logout') && (init as RequestInit | undefined)?.method === 'POST'
      ))).toBe(true);
    });
  });

  it('opens a lazy route that is not in the desktop tab list', async () => {
    setPath('/enhance');
    installFetchMock(true);

    render(<AppRouter />);

    expect(await screen.findByText('Страница загрузки API')).toBeInTheDocument();
  });
});
