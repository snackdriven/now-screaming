import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// Store our mutable headers map
let mockHeaders = new Map();
let mockRedirectUrl = null;

mock.module('next/headers', {
    namedExports: {
        headers: async () => mockHeaders
    }
});

mock.module('next/navigation', {
    namedExports: {
        redirect: (url) => { mockRedirectUrl = url; }
    }
});

const {
    getChatGPTUser,
    requireChatGPTUser,
    chatGPTSignInPath,
    chatGPTSignOutPath
} = await import('../app/chatgpt-auth.ts');

test('chatgpt-auth module tests', async (t) => {
    t.beforeEach(() => {
        mockHeaders = new Map();
        mockRedirectUrl = null;
    });

    await t.test('getChatGPTUser returns null when email is missing', async () => {
        const user = await getChatGPTUser();
        assert.equal(user, null);
    });

    await t.test('getChatGPTUser extracts user from headers correctly', async () => {
        mockHeaders.set('oai-authenticated-user-email', 'test@example.com');
        mockHeaders.set('oai-authenticated-user-full-name', 'Test%20User');
        mockHeaders.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');

        const user = await getChatGPTUser();
        assert.deepEqual(user, {
            displayName: 'Test User',
            email: 'test@example.com',
            fullName: 'Test User'
        });
    });

    await t.test('getChatGPTUser handles decoding errors gracefully', async () => {
        mockHeaders.set('oai-authenticated-user-email', 'test@example.com');
        mockHeaders.set('oai-authenticated-user-full-name', '%E0%A4%A'); // Invalid percent encoding
        mockHeaders.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');

        const user = await getChatGPTUser();
        assert.deepEqual(user, {
            displayName: 'test@example.com',
            email: 'test@example.com',
            fullName: null
        });
    });

    await t.test('getChatGPTUser ignores full name if encoding is not percent-encoded-utf-8', async () => {
        mockHeaders.set('oai-authenticated-user-email', 'test@example.com');
        mockHeaders.set('oai-authenticated-user-full-name', 'Test%20User');
        mockHeaders.set('oai-authenticated-user-full-name-encoding', 'unknown-encoding');

        const user = await getChatGPTUser();
        assert.deepEqual(user, {
            displayName: 'test@example.com',
            email: 'test@example.com',
            fullName: null
        });
    });

    await t.test('requireChatGPTUser returns user if logged in', async () => {
        mockHeaders.set('oai-authenticated-user-email', 'test@example.com');

        const user = await requireChatGPTUser('/');
        assert.deepEqual(user, {
            displayName: 'test@example.com',
            email: 'test@example.com',
            fullName: null
        });
        assert.equal(mockRedirectUrl, null);
    });

    await t.test('requireChatGPTUser redirects to sign in if not logged in', async () => {
        await requireChatGPTUser('/dashboard');
        assert.equal(mockRedirectUrl, '/signin-with-chatgpt?return_to=%2Fdashboard');
    });

    await t.test('chatGPTSignInPath constructs correct path', () => {
        assert.equal(chatGPTSignInPath('/dashboard'), '/signin-with-chatgpt?return_to=%2Fdashboard');
        // fallback to / for invalid paths
        assert.equal(chatGPTSignInPath('https://external.com/foo'), '/signin-with-chatgpt?return_to=%2F');
    });

    });
