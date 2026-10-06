// The integration run has no Google or Brevo credentials on purpose
// (setupEnv). The services log that, which is expected: drop exactly those
// lines and let every other warning or error through.
const EXPECTED = [
  /^ ?Google Calendar Service Account credentials are not fully configured/,
  /^\[event-email\] Confirmation template not configured; skipped for registration /,
  /^\[event-admin\] \d+ cancellation email\(s\) failed for event \S+ La plantilla de Brevo EVENT_CANCELED no está configurada/,
];

for (const method of ['warn', 'error']) {
  const original = console[method].bind(console);
  jest.spyOn(console, method).mockImplementation((...args) => {
    const text = args.map(String).join(' ');
    if (!EXPECTED.some((pattern) => pattern.test(text))) original(...args);
  });
}
