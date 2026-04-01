// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
require('@testing-library/jest-dom');

// Mock next/navigation for client components during tests
jest.mock('next/navigation', () => {
	return {
		useRouter: () => ({
			push: jest.fn(),
			back: jest.fn(),
			replace: jest.fn(),
			forward: jest.fn(),
			prefetch: jest.fn(),
		}),
		useSearchParams: () => {
			const params = new URLSearchParams();
			return {
				get: (key) => params.get(key),
				toString: () => params.toString(),
			};
		},
	};
});

// Mock i18n provider hook with a minimal implementation
jest.mock('./lib/i18n', () => {
	const en = require('./lib/i18n/locales/en.json');
	const get = (obj, path, fallback) => path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback ?? path;
	return {
		useI18n: () => ({
			t: (key, vars) => {
				let template = get(en, key, key);
				if (vars) {
					Object.entries(vars).forEach(([k, v]) => {
						template = template.replace(`{${k}}`, String(v));
					});
				}
				return template;
			},
			formatCurrency: (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(n ?? 0),
			locale: 'en'
		}),
	};
});


// Mock authentication context
jest.mock('./app/context/SecureAuthContext', () => ({
	useAuth: jest.fn(() => ({
		user: {
			isLoggedIn: true,
			email: 'test@example.com',
			name: 'Test User'
		}
	}))
}));

// Mock global fetch
global.fetch = jest.fn();

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn(),
}));

// Silence console errors from React 19 act warnings in CI noise
const originalError = console.error;
console.error = (...args) => {
	if (typeof args[0] === 'string' && args[0].includes('ReactDOMTestUtils.act')) return;
	originalError(...args);
};
