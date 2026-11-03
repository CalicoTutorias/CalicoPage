import {
  loadWompiScript, createWompiWidget, readLastWompiCheckout, clearLastWompiCheckout,
} from '@/app/services/utils/wompiCheckout';

const STORAGE_KEY = 'calico_last_wompi_checkout';
const DAY_MS = 24 * 60 * 60 * 1000;

const WIDGET_ARGS = {
  amountInCents: 5000000,
  reference: 'ref1',
  publicKey: 'pub',
  signature: 'sig',
  customer: { email: 'a@b.co', fullName: 'Ana', phoneNumber: '300' },
};

describe('wompiCheckout', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    document.getElementById('wompi-widget-script')?.remove();
    delete window.WidgetCheckout;
  });

  test('loadWompiScript is idempotent', () => {
    loadWompiScript();
    loadWompiScript();
    expect(document.querySelectorAll('#wompi-widget-script')).toHaveLength(1);
  });

  test('test_should_send_wompi_back_to_the_calico_confirm_page', () => {
    window.WidgetCheckout = jest.fn();
    createWompiWidget({ ...WIDGET_ARGS, returnTo: '/home/history' });
    expect(window.WidgetCheckout).toHaveBeenCalledWith({
      currency: 'COP',
      amountInCents: 5000000,
      reference: 'ref1',
      publicKey: 'pub',
      signature: { integrity: 'sig' },
      redirectUrl: `${window.location.origin}/payments/confirm`,
      customerData: {
        email: 'a@b.co', fullName: 'Ana', phoneNumber: '300',
        phoneNumberPrefix: '+57', legalId: '123456789', legalIdType: 'CC',
      },
    });
  });

  test('test_should_remember_the_checkout_for_the_return_page', () => {
    window.WidgetCheckout = jest.fn();
    createWompiWidget({ ...WIDGET_ARGS, returnTo: '/eventos/repaso-calculo' });
    expect(readLastWompiCheckout()).toEqual({
      reference: 'ref1', returnTo: '/eventos/repaso-calculo', savedAt: expect.any(Number),
    });
  });

  test('test_should_still_build_the_widget_when_storage_is_unavailable', () => {
    window.WidgetCheckout = jest.fn();
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      createWompiWidget(WIDGET_ARGS);
      expect(window.WidgetCheckout).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  describe('readLastWompiCheckout', () => {
    const store = (value) => window.localStorage.setItem(STORAGE_KEY, value);

    test('test_should_return_null_when_nothing_was_remembered', () => {
      expect(readLastWompiCheckout()).toBeNull();
    });

    test('test_should_return_null_when_the_entry_is_older_than_24h', () => {
      store(JSON.stringify({ reference: 'ref1', returnTo: '/home/history', savedAt: Date.now() - DAY_MS - 1000 }));
      expect(readLastWompiCheckout()).toBeNull();
    });

    test.each([
      ['not JSON', '{oops'],
      ['no reference', JSON.stringify({ returnTo: '/home/history', savedAt: Date.now() })],
      ['no savedAt', JSON.stringify({ reference: 'ref1', returnTo: '/home/history' })],
      ['JSON null', 'null'],
    ])('test_should_return_null_when_the_entry_is_malformed (%s)', (_label, raw) => {
      store(raw);
      expect(readLastWompiCheckout()).toBeNull();
    });

    test('test_should_drop_an_off_site_returnTo', () => {
      store(JSON.stringify({ reference: 'ref1', returnTo: 'https://evil.example', savedAt: Date.now() }));
      expect(readLastWompiCheckout()).toEqual({ reference: 'ref1', returnTo: null, savedAt: expect.any(Number) });
    });

    test('test_should_forget_the_checkout_once_cleared', () => {
      store(JSON.stringify({ reference: 'ref1', returnTo: '/home/history', savedAt: Date.now() }));
      clearLastWompiCheckout();
      expect(readLastWompiCheckout()).toBeNull();
    });
  });
});
