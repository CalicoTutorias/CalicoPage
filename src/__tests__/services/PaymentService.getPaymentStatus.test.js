import { PaymentService } from '../../app/services/core/PaymentService';
import { authFetch } from '../../app/services/authFetch';

jest.mock('../../app/services/authFetch', () => ({ authFetch: jest.fn() }));

describe('PaymentService.getPaymentStatus', () => {
    beforeEach(() => authFetch.mockReset());

    it('requests the encoded reference and returns confirmed with session', async () => {
        authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, state: 'confirmed', session: { id: 's' } } });
        const res = await PaymentService.getPaymentStatus('a b');
        expect(authFetch.mock.calls[0][0]).toContain('/api/payments/status?reference=a%20b');
        expect(res).toEqual({ state: 'confirmed', session: { id: 's' } });
    });

    it('returns failed', async () => {
        authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, state: 'failed' } });
        expect(await PaymentService.getPaymentStatus('r')).toEqual({ state: 'failed' });
    });

    it.each([[404], [500], [503], [0]])('maps status %s to pending', async (status) => {
        authFetch.mockResolvedValue({ ok: false, status, data: null });
        expect(await PaymentService.getPaymentStatus('r')).toEqual({ state: 'pending' });
    });

    it('throws on other 4xx', async () => {
        authFetch.mockResolvedValue({ ok: false, status: 403, data: { success: false, error: 'FORBIDDEN' } });
        await expect(PaymentService.getPaymentStatus('r')).rejects.toThrow('FORBIDDEN');
    });
});
