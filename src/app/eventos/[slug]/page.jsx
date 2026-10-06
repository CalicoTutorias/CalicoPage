import EventDetailView from './EventDetailView';
import * as eventService from '@/lib/services/event.service';

// Documented exception to the fetch-through-API rule: metadata must be
// rendered on the server for link previews (WhatsApp, Instagram).
export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const meta = await eventService.getEventMetaForPage(slug);
    if (!meta) return { title: 'Evento · Calico' };
    const images = meta.coverImageUrl ? [meta.coverImageUrl] : ['/CalicoLogo.png'];
    return {
      title: `${meta.title} · Calico`,
      description: meta.description,
      openGraph: { title: meta.title, description: meta.description, images, type: 'website' },
      twitter: { card: 'summary_large_image', title: meta.title, description: meta.description, images },
    };
  } catch {
    return { title: 'Evento · Calico' };
  }
}

export default async function EventPage({ params }) {
  const { slug } = await params;
  return <EventDetailView slug={slug} />;
}
