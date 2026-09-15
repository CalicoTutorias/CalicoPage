import { normalizeGooglePictureUrl, GOOGLE_PICTURE_SIZE } from '../google-picture';

describe('normalizeGooglePictureUrl', () => {
  it('upgrades the default 96px thumbnail to the configured size', () => {
    expect(normalizeGooglePictureUrl('https://lh3.googleusercontent.com/a/ACg8ocK123=s96-c'))
      .toBe(`https://lh3.googleusercontent.com/a/ACg8ocK123=s${GOOGLE_PICTURE_SIZE}-c`);
  });

  it('keeps extra flags after the size token', () => {
    expect(normalizeGooglePictureUrl('https://lh3.googleusercontent.com/a/x=s96-c-rp-mo', 256))
      .toBe('https://lh3.googleusercontent.com/a/x=s256-c-rp-mo');
  });

  it('appends a size to legacy URLs without params', () => {
    expect(normalizeGooglePictureUrl('https://lh3.googleusercontent.com/-abc/AAAA/photo.jpg'))
      .toBe(`https://lh3.googleusercontent.com/-abc/AAAA/photo.jpg=s${GOOGLE_PICTURE_SIZE}-c`);
  });

  it('leaves non-Google URLs, null and undefined untouched', () => {
    const s3 = 'https://calico-uploads.s3.us-east-1.amazonaws.com/profile-pictures/u/abc.webp';
    expect(normalizeGooglePictureUrl(s3)).toBe(s3);
    expect(normalizeGooglePictureUrl(null)).toBeNull();
    expect(normalizeGooglePictureUrl(undefined)).toBeUndefined();
  });

  it('does not touch a Google URL whose size is already explicit and unparseable', () => {
    const odd = 'https://lh3.googleusercontent.com/a/x=w100-h100';
    expect(normalizeGooglePictureUrl(odd)).toBe(odd);
  });
});
