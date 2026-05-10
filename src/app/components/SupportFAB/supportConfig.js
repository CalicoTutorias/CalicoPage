/**
 * Support FAB configuration.
 *
 * Replace placeholder values below with the production endpoints, links, and
 * contact details. Empty / falsy entries are automatically hidden in the UI,
 * so it is safe to leave a channel blank if it isn't ready yet.
 */
export const SUPPORT_CONFIG = {
  contact: {
    // TODO: replace with the support inbox.
    email: "calico-tutorias@gmail.com",

    // TODO: replace with the WhatsApp business number (digits only) and the
    // human-readable label.
    whatsappNumber: "573102906071",
    whatsappLabel: "+57 310 290 6071",

    // TODO: replace with the Discord invite or community link.
    discordUrl: "",
  },

  // TODO: replace with the Google Forms / Microsoft Forms / Tally bug report URL.
  bugReportUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfze4IPZgAgv5_QVnyUiz7qERc5fT9_7kuCbklviToSULObPA/viewform?usp=publish-editor",

  // TODO: replace with the FAQ / docs URL or an internal route. Leave empty to
  // hide the FAQ entry from the menu.
  faqUrl: "",
};

export const buildWhatsAppLink = (number, prefilledText = "") => {
  if (!number) return "";
  const digits = String(number).replace(/\D/g, "");
  const text = prefilledText ? `?text=${encodeURIComponent(prefilledText)}` : "";
  return `https://wa.me/${digits}${text}`;
};

export const buildMailtoLink = (email, subject = "", body = "") => {
  if (!email) return "";
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return `mailto:${email}${query}`;
};
