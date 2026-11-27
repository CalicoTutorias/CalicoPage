import InvitationView from './InvitationView';

// The link carries a secret token: keep it out of search engines and out of
// the Referer header of anything the page links to.
export const metadata = {
  title: 'Invitación a una tutoría · Calico',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvitationPage({ params }) {
  const { key } = await params;
  return <InvitationView invitationKey={key} />;
}
