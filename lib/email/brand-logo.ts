// Logo in the header of every e-mail. E-mail clients do not render SVG, so this
// is a PNG of the approved white wordmark, served from the production origin so
// it keeps loading in e-mails opened long after they were sent; the alt text
// keeps the name readable when the client blocks images. The Supabase auth
// templates and the booking-reminders function repeat this same tag.
export const EMAIL_LOGO_URL = "https://agendfined.com.br/brand/email-logo.png";

export const EMAIL_LOGO_HTML = `<img src="${EMAIL_LOGO_URL}" width="160" height="30" alt="AgendFined" style="display:block;width:160px;height:30px;border:0;outline:none;text-decoration:none;color:#eeeeee;font-size:17px;font-weight:700;line-height:30px;">`;
