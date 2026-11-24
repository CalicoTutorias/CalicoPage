/**
 * One-off backfill: open the Google Meet of every upcoming event on the
 * central Calico calendar to anyone with the link (Meet accessType OPEN).
 *
 * Why: Meets created through the Calendar API default to RESTRICTED, so anyone
 * not invited (or not signed in with the invited Google account) must knock to
 * a host — the Calico admin account — who is never in the call. New events are
 * opened at creation (openMeetAccess in calico-calendar.service.js); this fixes
 * the ones already booked.
 *
 * Usage (dry run — lists what would change, writes nothing):
 *   pnpm calendar:open-meets
 * Apply:
 *   pnpm calendar:open-meets -- --apply
 *
 * Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / CALICO_CALENDAR_ID and a
 * GOOGLE_ADMIN_REFRESH_TOKEN granted the calendar and meetings.space.settings
 * scopes, with the Google Meet REST API enabled in the Cloud project.
 */

import { OAuth2Client } from 'google-auth-library';

const APPLY = process.argv.includes('--apply');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADMIN_REFRESH_TOKEN, CALICO_CALENDAR_ID } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_ADMIN_REFRESH_TOKEN || !CALICO_CALENDAR_ID) {
  console.error('ERROR: Google calendar env vars are not set. Run with --env-file=.env');
  process.exit(1);
}

const auth = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: GOOGLE_ADMIN_REFRESH_TOKEN });

const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALICO_CALENDAR_ID)}/events`;
const counts = { events: 0, alreadyOpen: 0, opened: 0, wouldOpen: 0, failed: 0 };
let pageToken;

do {
  const params = new URLSearchParams({ timeMin: new Date().toISOString(), singleEvents: 'true', maxResults: '250' });
  if (pageToken) params.set('pageToken', pageToken);
  const { data } = await auth.request({ url: `${calendarUrl}?${params}` });
  pageToken = data.nextPageToken;

  for (const event of data.items || []) {
    const meetingCode = event.conferenceData?.conferenceId;
    if (event.status === 'cancelled' || event.conferenceData?.conferenceSolution?.key?.type !== 'hangoutsMeet' || !meetingCode) continue;
    counts.events += 1;
    try {
      const { data: space } = await auth.request({ url: `https://meet.googleapis.com/v2/spaces/${meetingCode}` });
      if (space.config?.accessType === 'OPEN') {
        counts.alreadyOpen += 1;
        continue;
      }
      console.log(`${event.start?.dateTime}  ${meetingCode}  ${space.config?.accessType ?? 'default'} -> OPEN`);
      if (!APPLY) {
        counts.wouldOpen += 1;
        continue;
      }
      await auth.request({
        url: `https://meet.googleapis.com/v2/${space.name}?updateMask=config.accessType`,
        method: 'PATCH',
        data: { config: { accessType: 'OPEN' } },
      });
      counts.opened += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`FAILED ${meetingCode}: ${error.response?.status ?? ''} ${error.response?.data?.error?.message ?? error.message}`);
    }
  }
} while (pageToken);

console.log(APPLY ? 'Applied.' : 'Dry run (pass -- --apply to write).', counts);
