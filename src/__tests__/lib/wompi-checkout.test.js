import { loadWompiScript, createWompiWidget } from '@/app/services/utils/wompiCheckout';

describe('wompiCheckout', () => {
  afterEach(() => {
    document.getElementById('wompi-widget-script')?.remove();
    delete window.WidgetCheckout;
  });

  test('loadWompiScript is idempotent', () => {
    loadWompiScript();
    loadWompiScript();
    expect(document.querySelectorAll('#wompi-widget-script')).toHaveLength(1);
  });

  test('createWompiWidget builds the widget config', () => {
    window.WidgetCheckout = jest.fn();
    createWompiWidget({
      amountInCents: 5000000,
      reference: 'ref1',
      publicKey: 'pub',
      signature: 'sig',
      customer: { email: 'a@b.co', fullName: 'Ana', phoneNumber: '300' },
    });
    expect(window.WidgetCheckout).toHaveBeenCalledWith({
      currency: 'COP',
      amountInCents: 5000000,
      reference: 'ref1',
      publicKey: 'pub',
      signature: { integrity: 'sig' },
      redirectUrl: 'https://transaction-redirect.wompi.co/check',
      customerData: {
        email: 'a@b.co', fullName: 'Ana', phoneNumber: '300',
        phoneNumberPrefix: '+57', legalId: '123456789', legalIdType: 'CC',
      },
    });
  });
});
