import { pollPaymentStatus } from '../../app/services/utils/pollPaymentStatus';
import { PaymentService } from '../../app/services/core/PaymentService';

jest.mock('../../app/services/core/PaymentService', () => ({
    PaymentService: { getPaymentStatus: jest.fn() },
}));

const flush = async (ms) => {
    await jest.advanceTimersByTimeAsync(ms);
};

describe('pollPaymentStatus', () => {
    let cb;
    beforeEach(() => {
        jest.useFakeTimers();
        PaymentService.getPaymentStatus.mockReset();
        cb = { onConfirmed: jest.fn(), onFailed: jest.fn(), onTimeout: jest.fn() };
    });
    afterEach(() => jest.useRealTimers());

    it('calls onConfirmed with the session and stops', async () => {
        PaymentService.getPaymentStatus
            .mockResolvedValueOnce({ state: 'pending' })
            .mockResolvedValueOnce({ state: 'confirmed', session: { id: 's1' } });
        pollPaymentStatus('ref', cb);
        await flush(5000);
        expect(cb.onConfirmed).not.toHaveBeenCalled();
        await flush(5000);
        expect(cb.onConfirmed).toHaveBeenCalledWith({ id: 's1' });
        await flush(30000);
        expect(PaymentService.getPaymentStatus).toHaveBeenCalledTimes(2);
    });

    it('calls onFailed when the payment failed', async () => {
        PaymentService.getPaymentStatus.mockResolvedValue({ state: 'failed' });
        pollPaymentStatus('ref', cb);
        await flush(5000);
        expect(cb.onFailed).toHaveBeenCalledTimes(1);
        expect(cb.onConfirmed).not.toHaveBeenCalled();
    });

    it('calls onTimeout after 10 minutes of pending', async () => {
        PaymentService.getPaymentStatus.mockResolvedValue({ state: 'pending' });
        pollPaymentStatus('ref', cb);
        await flush(9 * 60 * 1000);
        expect(cb.onTimeout).not.toHaveBeenCalled();
        await flush(61 * 1000);
        expect(cb.onTimeout).toHaveBeenCalledTimes(1);
        const calls = PaymentService.getPaymentStatus.mock.calls.length;
        await flush(60000);
        expect(PaymentService.getPaymentStatus).toHaveBeenCalledTimes(calls);
    });

    it('keeps polling after an error and then confirms', async () => {
        PaymentService.getPaymentStatus
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce({ state: 'confirmed', session: { id: 's2' } });
        pollPaymentStatus('ref', cb);
        await flush(10000);
        expect(cb.onConfirmed).toHaveBeenCalledWith({ id: 's2' });
    });

    it('does nothing after cancel', async () => {
        PaymentService.getPaymentStatus.mockResolvedValue({ state: 'confirmed', session: {} });
        const cancel = pollPaymentStatus('ref', cb);
        cancel();
        await flush(60000);
        expect(PaymentService.getPaymentStatus).not.toHaveBeenCalled();
        expect(cb.onConfirmed).not.toHaveBeenCalled();
    });
});
